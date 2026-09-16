import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MonitorEventEnvelope } from "@getpochi/common";
import { BackgroundJobManager } from "@getpochi/livekit";
import { makeJobStore } from "@getpochi/livekit/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestCliAdaptor } from "./cli-adaptor";

describe("monitor execution through the shared background job manager", () => {
  let outputDir: string;
  let data: ReturnType<typeof makeJobStore>;
  let adaptor: ReturnType<typeof createTestCliAdaptor>;
  let manager: BackgroundJobManager;
  const taskId = "monitor-owner";
  const events = () => manager.getPendingNotifications(taskId).filter(
    (event): event is MonitorEventEnvelope => "lines" in event,
  );
  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), "pochi-monitor-test-"));
    data = makeJobStore();
    adaptor = createTestCliAdaptor({ commandOutputDir: outputDir, store: data.store });
    manager = BackgroundJobManager.forStore(data.store);
    manager.connect(adaptor.commandAdaptor);
    await manager.watchTask(taskId);
  });
  afterEach(async () => {
    await adaptor.stopBackgroundCommands();
    await manager.dispose();
    await rm(outputDir, { recursive: true, force: true });
  });
  it("wakes before exit, retains stderr only in the transcript, and delivers one end event", async () => {
    const job = adaptor.startBackgroundCommand(taskId,
      "printf 'event\\n'; printf 'diagnostic\\n' >&2; sleep 1", ".", undefined,
      { description: "test monitor" },
    );
    expect(job.backgroundJobId).toMatch(/^bgjob-monitor-/);
    expect(await manager.wait(taskId, { timeoutMs: 2000, wakeOnNotifications: true })).toBe("notifications");
    expect(manager.hasPending(taskId)).toBe(true);
    expect(events().flatMap((event) => event.lines)).toEqual(["event"]);
    expect(await manager.wait(taskId, { timeoutMs: 2000 })).toBe("completed");
    expect(events().filter((event) => event.ended)).toHaveLength(1);
    expect(events().at(-1)?.ended?.status).toBe("completed");
    expect(new Set(events().map((event) => event.notificationId)).size).toBe(events().length);
    expect(manager.getPendingNotifications(taskId).every((event) => "lines" in event)).toBe(true);
    expect(await readFile(job.outputFile, "utf8")).toContain("diagnostic");
    expect(manager.getJobsForTask(taskId)[0]).toMatchObject({ monitor: "test monitor", status: "completed" });
  });
  it("wakes for a command result while a persistent monitor is silent", async () => {
    adaptor.startBackgroundCommand(taskId, "exec sleep 30", ".", undefined, { description: "persistent" });
    adaptor.startBackgroundCommand(taskId, "sleep 0.05", ".");
    expect(await manager.wait(taskId, { timeoutMs: 1000, wakeOnNotifications: true })).toBe("notifications");
    expect(manager.hasPending(taskId)).toBe(true);
  });
  it.each([
    ["sleep 3 | cat", 30],
    ["trap '' TERM; exec sleep 5", 100],
  ])("stops the entire monitor process group: %s", async (command, timeoutMs) => {
    adaptor.startBackgroundCommand(taskId, command, ".", undefined, { description: "deadline", timeoutMs });
    expect(await manager.wait(taskId, { timeoutMs: 2500 })).toBe("completed");
    expect(events().at(-1)?.ended).toMatchObject({ status: "stopped", reason: "killed after timeout" });
  });
  it("isolates ownership and acknowledges only events persisted in the conversation", async () => {
    await manager.watchTask("sibling");
    const job = adaptor.startBackgroundCommand(taskId, "printf 'ready\\n'; sleep 30", ".", undefined, { description: "owned monitor" });
    await manager.wait(taskId, { timeoutMs: 1500, wakeOnNotifications: true });
    const delivered = events();
    expect(delivered).toHaveLength(1);
    expect(manager.getPendingNotifications("sibling")).toEqual([]);
    await expect(manager.kill(job.backgroundJobId, "sibling")).rejects.toThrow("not found");
    data.setMessages(taskId, [{ id: "delivery", role: "user", parts: [{ type: "data-monitor-events", data: { batches: delivered } }] }]);
    await expect.poll(() => manager.getPendingNotifications(taskId)).toEqual([]);
    expect(manager.hasPending(taskId)).toBe(true);
    await manager.kill(job.backgroundJobId, taskId);
    expect(await manager.wait(taskId, { timeoutMs: 2000 })).toBe("completed");
    expect(events()).toHaveLength(1);
    expect(events()[0].ended?.status).toBe("stopped");
  });
  it("restores delivered history without granting a fork process ownership", async () => {
    data.setMessages("fork", [{ id: "copied", role: "user", parts: [{ type: "data-monitor-events", data: { batches: [{
      notificationId: "event", backgroundJobId: "bgjob-monitor-history", description: "CI", command: "watch", outputFile: "/tmp/watch.log", lines: [], ended: { status: "completed", exitCode: 0, reason: "done" },
    }] } }] }]);
    await manager.watchTask("fork");
    expect(manager.getJobsForTask("fork")[0]).toMatchObject({ monitor: "CI", status: "completed", exitCode: 0 });
    expect(manager.hasPending("fork")).toBe(false);
    await expect(manager.kill("bgjob-monitor-history", "fork")).rejects.toThrow("not found");
  });
});
