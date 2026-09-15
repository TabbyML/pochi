import { BackgroundJobManager } from "@getpochi/livekit";
import { makeJobStore } from "../../livekit/src/background-job/__tests__/test-store";
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
  it("delivers real command completion only to its owning task", async () => {
    testPaths.root = await mkdtemp(join(tmpdir(), "pochi-adaptor-test-"));
    const { store } = makeJobStore();
    const adaptor = createAdaptor(store);
    const manager = BackgroundJobManager.forStore(store);
    manager.connect(adaptor.commandSource);
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
    } finally {
      await manager.dispose();
      await adaptor.stopBackgroundCommands();
      await rm(testPaths.root, { recursive: true, force: true });
    }
  });
});
