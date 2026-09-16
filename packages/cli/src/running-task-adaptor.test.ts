import { BackgroundJobManager } from "@getpochi/livekit";
import { makeJobStore } from "@getpochi/livekit/testing";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CliRunningTaskAdaptor } from "./running-task-adaptor";

const testPaths = vi.hoisted(() => ({ root: "" }));
vi.mock("../../common/src/tool-utils/pochi-paths", () => ({
  getPochiDataDir: () => testPaths.root,
  getTaskDataDir: (id: string) => `${testPaths.root}/tasks/${id}`,
}));

function createAdaptor(store: ReturnType<typeof makeJobStore>["store"]) {
  return new CliRunningTaskAdaptor({
    store,
    blobStore: {} as never,
    llm: {} as never,
    cwd: process.cwd(),
    rg: "rg",
    filesystem: {} as never,
    projectMemoryEnabled: false,
  });
}

describe("CliRunningTaskAdaptor command ownership", () => {
  it("returns fork command timeouts with output without creating a background job", async () => {
    testPaths.root = await mkdtemp(join(tmpdir(), "pochi-fork-timeout-"));
    const { store } = makeJobStore();
    const adaptor = createAdaptor(store);
    const start = vi.spyOn(adaptor, "startBackgroundCommand");
    const adopt = vi.spyOn(adaptor, "adoptBackgroundCommand");
    try {
      const context = {
        taskId: randomUUID(),
        parentTaskId: undefined,
        storeId: "test",
        toolName: "executeCommand",
        toolCallId: randomUUID(),
        abortSignal: new AbortController().signal,
        toolPolicies: undefined,
        allowBackground: false,
      };
      const rejected = await adaptor.executeToolCall({
        ...context,
        input: { command: "echo forbidden", background: true },
      });
      expect(rejected).toMatchObject({
        error: expect.stringContaining("not available"),
      });
      const result = await adaptor.executeToolCall({
        ...context,
        toolCallId: randomUUID(),
        input: { command: "printf captured; exec sleep 10", timeout: 1 },
      });
      expect(result).toMatchObject({
        output: expect.stringContaining("captured"),
        error: expect.stringContaining("timed out"),
      });
      expect(result).not.toHaveProperty("_meta.backgroundJobId");
      expect(start).not.toHaveBeenCalled();
      expect(adopt).not.toHaveBeenCalled();
    } finally {
      await adaptor.stopBackgroundCommands();
      await rm(testPaths.root, { recursive: true, force: true });
    }
  });

  it("delivers real command completion only to its owning task", async () => {
    testPaths.root = await mkdtemp(join(tmpdir(), "pochi-adaptor-test-"));
    const { store, setMessages } = makeJobStore();
    const adaptor = createAdaptor(store);
    const manager = BackgroundJobManager.forStore(store);
    manager.connect(adaptor.commandAdaptor);
    const taskId = randomUUID();
    const otherId = randomUUID();
    await manager.watchTask(taskId);
    await manager.watchTask(otherId);
    try {
      const result = await adaptor.executeToolCall({
        taskId,
        parentTaskId: undefined,
        storeId: "test",
        toolName: "executeCommand",
        toolCallId: randomUUID(),
        input: { command: "printf done", background: true },
        abortSignal: new AbortController().signal,
        toolPolicies: undefined,
      });
      expect(result).toMatchObject({
        _meta: { backgroundJobId: expect.stringMatching(/^bgjob-cmd-/) },
      });
      await manager.wait(taskId);
      expect(manager.getPendingNotifications(taskId)).toEqual([
        expect.objectContaining({ kind: "command", status: "completed" }),
      ]);
      expect(manager.getPendingNotifications(otherId)).toEqual([]);
      const notices = manager.getPendingNotifications(taskId);
      setMessages(taskId, [
        {
          id: "delivered",
          role: "user",
          parts: notices.map((data) => ({
            type: "data-background-job-notification",
            data,
          })),
        },
      ]);
      // Compaction can remove the message after its notification is acknowledged.
      setMessages(taskId, []);
      expect(manager.getPendingNotifications(taskId)).toEqual([]);
    } finally {
      await manager.dispose();
      await adaptor.stopBackgroundCommands();
      await rm(testPaths.root, { recursive: true, force: true });
    }
  });
});
