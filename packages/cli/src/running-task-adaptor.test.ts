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

function createAdaptor() {
  return new CliRunningTaskAdaptor({
    store: {} as never,
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
    const adaptor = createAdaptor();
    const taskId = randomUUID();
    const owner = adaptor.backgroundCommands(taskId);
    const other = adaptor.backgroundCommands(randomUUID());
    try {
      const result = await adaptor.executeToolCall({
        taskId, parentTaskId: undefined, storeId: "test", toolName: "executeCommand",
        toolCallId: randomUUID(), input: { command: "printf done", background: true },
        abortSignal: new AbortController().signal, toolPolicies: undefined,
      });
      expect(result).toMatchObject({ _meta: { backgroundJobId: expect.stringMatching(/^bgjob-cmd-/) } });
      await owner.waitForPending(new AbortController().signal);
      expect(owner.takeNotifications()).toEqual([expect.objectContaining({ kind: "command", status: "completed" })]);
      expect(owner.takeNotifications()).toEqual([]);
      expect(other.takeNotifications()).toEqual([]);
    } finally {
      owner.dispose();
      other.dispose();
      adaptor.dispose();
      await rm(testPaths.root, { recursive: true, force: true });
    }
  });
});
