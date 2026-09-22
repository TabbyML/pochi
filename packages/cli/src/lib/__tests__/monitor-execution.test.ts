import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BackgroundMonitorNotification } from "@getpochi/common";
import { BackgroundJobManager } from "@getpochi/livekit";
import { makeJobStore } from "@getpochi/livekit/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestCliAdaptor } from "./cli-adaptor";

describe("monitor execution through the shared background job manager", () => {
  let outputDir: string;
  let data: ReturnType<typeof makeJobStore>;
  let adaptor: ReturnType<typeof createTestCliAdaptor>;
  let manager: BackgroundJobManager;
  const taskId = "monitor-owner";
  const processGroups = new Set<number>();
  const isRunning = (pid: number) => {
    try {
      const status = execFileSync("ps", ["-p", String(pid), "-o", "stat="], {
        encoding: "utf8",
      }).trim();
      return status.length > 0 && !status.startsWith("Z");
    } catch {
      return false;
    }
  };
  async function startChildMonitor(script: string, timeoutMs?: number) {
    const ready = join(outputDir, "child.pid");
    const done = join(outputDir, "cleaned");
    const scriptPath = join(outputDir, "child.sh");
    await writeFile(scriptPath, script);
    const job = adaptor.startBackgroundCommand(
      taskId,
      'sh "$POCHI_MONITOR_TEST_SCRIPT" >/dev/null 2>&1 & wait',
      ".",
      {
        POCHI_MONITOR_TEST_SCRIPT: scriptPath,
        POCHI_MONITOR_TEST_PID: ready,
        POCHI_MONITOR_TEST_DONE: done,
      },
      { description: "child monitor", timeoutMs },
    );
    const pgid = (
      adaptor as unknown as {
        commands: Map<string, { process: { pid: number } }>;
      }
    ).commands.get(job.backgroundJobId)!.process.pid;
    processGroups.add(pgid);
    // The child publishes its PID only after installing its signal handlers.
    await expect
      .poll(() => readFile(ready, "utf8").catch(() => ""), { timeout: 1000 })
      .toMatch(/^\d+\n$/);
    const childPid = Number((await readFile(ready, "utf8")).trim());
    expect(Number.isInteger(childPid) && childPid > 0).toBe(true);
    expect(isRunning(childPid)).toBe(true);
    return { ...job, childPid, pgid, done };
  }
  const events = () => manager.getPendingNotifications(taskId).filter(
    (event): event is BackgroundMonitorNotification => event.kind === "monitor",
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
    vi.restoreAllMocks();
    // Failed assertions must not leave the test's TERM-ignoring children behind.
    for (const pgid of processGroups) {
      try {
        process.kill(-pgid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    }
    processGroups.clear();
    await adaptor.stopBackgroundCommands();
    await manager.dispose();
    await rm(outputDir, { recursive: true, force: true });
  });
  it("lets a noisy monitor finish and promotes its merged output after acknowledgement", async () => {
    const job = adaptor.startBackgroundCommand(taskId,
      'i=0; while [ "$i" -lt 14 ]; do printf "event-%s\\n" "$i"; i=$((i + 1)); sleep 0.25; done; printf "flood-finished\\n"',
      ".", undefined, { description: "noisy monitor" },
    );
    await expect.poll(async () => readFile(job.outputFile, "utf8"), { timeout: 6000 }).toContain("flood-finished");
    expect(await manager.wait(taskId, { timeoutMs: 2000 })).toBe("completed");
    expect(events().at(-1)?.ended?.status).toBe("completed");
    const first = events().slice(0, 1);
    expect(first).toHaveLength(1);
    expect(first[0].lines).toEqual(["event-0"]);
    data.setMessages(taskId, [{ id: "first", role: "user", parts: first.map((data) => ({ type: "data-background-job-notification", data })) }]);
    await expect.poll(() => events().flatMap((event) => event.lines)).toContain("flood-finished");
    expect(events()).toHaveLength(1);
    expect(events()[0].lines).toContain("event-1");
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
    expect(manager.getPendingNotifications(taskId).every((event) => event.kind === "monitor")).toBe(true);
    expect(await readFile(job.outputFile, "utf8")).toContain("diagnostic");
    expect(manager.getJobsForTask(taskId)[0]).toMatchObject({ monitor: "test monitor", status: "completed" });
  });
  it("wakes for a command result while a persistent monitor is silent", async () => {
    adaptor.startBackgroundCommand(taskId, "exec sleep 30", ".", undefined, { description: "persistent" });
    adaptor.startBackgroundCommand(taskId, "sleep 0.05", ".");
    expect(await manager.wait(taskId, { timeoutMs: 1000, wakeOnNotifications: true })).toBe("notifications");
    expect(manager.hasPending(taskId)).toBe(true);
  });
  it("keeps mixed notifications in one task queue and acknowledges each independently", async () => {
    await manager.watchTask("sibling");
    adaptor.startBackgroundCommand(taskId, "printf 'ready\\n'; sleep 30", ".", undefined, { description: "persistent" });
    expect(await manager.wait(taskId, { timeoutMs: 1500, wakeOnNotifications: true })).toBe("notifications");
    const [monitor] = events();
    const command = adaptor.startBackgroundCommand(taskId, "printf 'done\\n'", ".");
    await expect.poll(() => manager.getPendingNotifications(taskId)).toHaveLength(2);
    const completed = manager.getPendingNotifications(taskId).find((item) => item.kind === "command")!;
    expect(completed.backgroundJobId).toBe(command.backgroundJobId);
    expect(manager.getPendingNotifications("sibling")).toEqual([]);
    const sibling = await adaptor.commandAdaptor.observeNotifications("sibling", () => {});
    try {
      await sibling.acknowledge(monitor.notificationId);
      expect(manager.getPendingNotifications(taskId)).toEqual([monitor, completed]);
      data.setMessages(taskId, [{ id: "command", role: "user", parts: [{ type: "data-background-job-notification", data: completed }] }]);
      await expect.poll(() => manager.getPendingNotifications(taskId)).toEqual([monitor]);
      data.setMessages(taskId, [{ id: "both", role: "user", parts: [completed, monitor].map((data) => ({ type: "data-background-job-notification", data })) }]);
      await expect.poll(() => manager.getPendingNotifications(taskId)).toEqual([]);
      expect(manager.hasPending(taskId)).toBe(true);
    } finally {
      sibling.dispose();
    }
  });
  it.each([
    ["sleep 3 | cat", 30],
    ["trap '' TERM; exec sleep 5", 100],
  ])("stops the entire monitor process group: %s", async (command, timeoutMs) => {
    adaptor.startBackgroundCommand(taskId, command, ".", undefined, { description: "deadline", timeoutMs });
    expect(await manager.wait(taskId, { timeoutMs: 2500 })).toBe("completed");
    expect(events().at(-1)?.ended).toMatchObject({ status: "stopped", reason: "killed after timeout" });
  });
  describe.skipIf(process.platform === "win32")(
    "monitor process-group cancellation",
    () => {
      const ignoresTerm =
        'trap "" TERM HUP\nprintf "%s\\n" "$$" > "$POCHI_MONITOR_TEST_PID"\nexec sleep 30\n';

      it.each(["manual", "timeout", "shutdown"])(
        "waits for leftover children during %s cancellation",
        async (mode) => {
          const job = await startChildMonitor(
            ignoresTerm,
            mode === "timeout" ? 1500 : undefined,
          );
          if (mode === "manual") {
            await manager.kill(job.backgroundJobId, taskId);
            expect(await manager.wait(taskId, { timeoutMs: 100 })).toBe(
              "timeout",
            );
          } else if (mode === "shutdown") {
            await adaptor.stopBackgroundCommands(taskId);
            expect(isRunning(job.childPid)).toBe(false);
          }
          expect(await manager.wait(taskId, { timeoutMs: 3000 })).toBe(
            "completed",
          );
          await expect.poll(() => isRunning(job.childPid)).toBe(false);
          expect(events().filter((event) => event.ended)).toHaveLength(1);
          expect(events().at(-1)?.ended?.status).toBe("stopped");
        },
      );

      it("preserves the descendant's TERM cleanup and makes repeated cancellation idempotent", async () => {
        const job = await startChildMonitor(
          'trap \'sleep 0.2; printf cleaned > "$POCHI_MONITOR_TEST_DONE"; exit 0\' TERM\ntrap "" HUP\nprintf "%s\\n" "$$" > "$POCHI_MONITOR_TEST_PID"\nwhile :; do sleep 30; done\n',
        );
        const signals = vi.spyOn(process, "kill");
        await Promise.all([
          manager.kill(job.backgroundJobId, taskId),
          manager.kill(job.backgroundJobId, taskId),
        ]);
        expect(await manager.wait(taskId, { timeoutMs: 2000 })).toBe(
          "completed",
        );
        expect(await readFile(job.done, "utf8")).toBe("cleaned");
        expect(
          signals.mock.calls.filter(
            ([pid, signal]) => pid === -job.pgid && signal === "SIGTERM",
          ),
        ).toHaveLength(1);
        expect(
          signals.mock.calls.filter(
            ([pid, signal]) => pid === -job.pgid && signal === "SIGKILL",
          ),
        ).toHaveLength(0);
        expect(events().filter((event) => event.ended)).toHaveLength(1);
      });

      it("continues cleanup when the existence probe reports EPERM", async () => {
        const job = await startChildMonitor(ignoresTerm);
        const kill = process.kill.bind(process);
        vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
          if (pid === -job.pgid && signal === 0) {
            throw Object.assign(new Error("Cannot probe monitor group"), {
              code: "EPERM",
            });
          }
          return kill(pid, signal);
        });
        await manager.kill(job.backgroundJobId, taskId);
        expect(await manager.wait(taskId, { timeoutMs: 2000 })).toBe(
          "completed",
        );
        await expect.poll(() => isRunning(job.childPid)).toBe(false);
        expect(events().at(-1)?.ended?.status).toBe("stopped");
      });

      it.each(["SIGTERM", "SIGKILL"] as const)(
        "reports a failed %s signal instead of claiming the monitor stopped",
        async (failedSignal) => {
          const job = await startChildMonitor(ignoresTerm);
          const kill = process.kill.bind(process);
          vi.spyOn(process, "kill").mockImplementation((pid, signal) => {
            if (pid === -job.pgid && signal === failedSignal) {
              throw Object.assign(new Error("Cannot kill monitor group"), {
                code: "EPERM",
              });
            }
            return kill(pid, signal);
          });
          const cancellation = manager.kill(job.backgroundJobId, taskId);
          if (failedSignal === "SIGTERM") {
            await expect(cancellation).rejects.toThrow(
              "Failed to stop background command",
            );
          } else {
            await cancellation;
          }
          expect(await manager.wait(taskId, { timeoutMs: 2000 })).toBe(
            "completed",
          );
          expect(events().at(-1)?.ended).toMatchObject({
            status: "failed",
            reason: "Cannot kill monitor group",
          });
        },
      );
    },
  );
  it("isolates ownership and acknowledges only events persisted in the conversation", async () => {
    await manager.watchTask("sibling");
    const job = adaptor.startBackgroundCommand(taskId, "printf 'ready\\n'; sleep 30", ".", undefined, { description: "owned monitor" });
    await manager.wait(taskId, { timeoutMs: 1500, wakeOnNotifications: true });
    const delivered = events();
    expect(delivered).toHaveLength(1);
    expect(manager.getPendingNotifications("sibling")).toEqual([]);
    await expect(manager.kill(job.backgroundJobId, "sibling")).rejects.toThrow("not found");
    data.setMessages(taskId, [{ id: "delivery", role: "user", parts: delivered.map((data) => ({ type: "data-background-job-notification", data })) }]);
    await expect.poll(() => manager.getPendingNotifications(taskId)).toEqual([]);
    expect(manager.hasPending(taskId)).toBe(true);
    await manager.kill(job.backgroundJobId, taskId);
    expect(await manager.wait(taskId, { timeoutMs: 2000 })).toBe("completed");
    expect(events()).toHaveLength(1);
    expect(events()[0].ended?.status).toBe("stopped");
    expect(events()[0].ended?.reason).toBe("kill requested");
  });
  it("restores delivered history without granting a fork process ownership", async () => {
    data.setMessages("fork", [{ id: "copied", role: "user", parts: [{ type: "data-background-job-notification", data: {
      kind: "monitor", notificationId: "event", backgroundJobId: "bgjob-monitor-history", description: "CI", command: "watch", outputFile: "/tmp/watch.log", lines: [], ended: { status: "completed", exitCode: 0, reason: "done" },
    } }] }]);
    await manager.watchTask("fork");
    expect(manager.getJobsForTask("fork")[0]).toMatchObject({ monitor: "CI", status: "completed", exitCode: 0 });
    expect(manager.hasPending("fork")).toBe(false);
    await expect(manager.kill("bgjob-monitor-history", "fork")).rejects.toThrow("not found");
  });
});
