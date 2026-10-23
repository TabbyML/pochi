import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCallOptions } from "../../types";
import { killBackgroundJob } from "../kill-background-job";
import { newTask } from "../new-task";

const worktreeMocks = vi.hoisted(() => ({
  createSubagentWorktree: vi.fn(),
  finalizeSubagentWorktree: vi.fn(),
}));

vi.mock("@getpochi/common/tool-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@getpochi/common/tool-utils")>()),
  ...worktreeMocks,
}));

describe("background newTask", () => {
  it.each([true, undefined])("returns a background task id without starting a foreground runner (background: %s)", async (background) => {
    const createSubTaskRunner = vi.fn();
    const backgroundSubTask = vi.fn().mockResolvedValue(undefined);
    const execute = newTask({ createSubTaskRunner, backgroundSubTask } as unknown as ToolCallOptions);
    const result = await execute({
      description: "Research", prompt: "Find the cause", background, _meta: { uid: "worker" },
    }, { toolCallId: "call" } as Parameters<typeof execute>[1]);
    expect(backgroundSubTask).toHaveBeenCalledWith({ taskId: "worker", agentType: undefined });
    expect(createSubTaskRunner).not.toHaveBeenCalled();
    expect(result).toMatchObject({ backgroundJobId: "bgjob-task-worker", result: expect.stringContaining("started in the background") });
  });

  it("reports an unavailable background executor instead of claiming success", async () => {
    const execute = newTask({ createSubTaskRunner: vi.fn() } as unknown as ToolCallOptions);
    await expect(execute({
      description: "Research", prompt: "Find the cause", background: true, _meta: { uid: "worker" },
    }, { toolCallId: "call" } as Parameters<typeof execute>[1])).rejects.toThrow("Background subagent execution is not available");
  });

  it("falls back to the foreground when no background executor is available", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const createSubTaskRunner = vi.fn(() => ({ run, state: { messages: [] } }));
    const execute = newTask({ createSubTaskRunner } as unknown as ToolCallOptions);
    await execute({ description: "Research", prompt: "Find the cause", _meta: { uid: "worker" } }, { toolCallId: "call" } as Parameters<typeof execute>[1]);
    expect(run).toHaveBeenCalledOnce();
  });

  it.each([
    ["opted out of the background", undefined, false],
    ["a foreground-only agent", "attemptTodoCompletion", undefined],
  ] as const)("runs %s in the foreground", async (_label, agentType, background) => {
    const run = vi.fn().mockResolvedValue(undefined);
    const createSubTaskRunner = vi.fn(() => ({ run, state: { messages: [] } }));
    const backgroundSubTask = vi.fn();
    const execute = newTask({ createSubTaskRunner, backgroundSubTask } as unknown as ToolCallOptions);
    await execute({ description: "Research", prompt: "Find the cause", agentType, background, _meta: { uid: "worker" } }, { toolCallId: "call" } as Parameters<typeof execute>[1]);
    expect(run).toHaveBeenCalledOnce();
    expect(backgroundSubTask).not.toHaveBeenCalled();
  });
});

describe("kill background subagent", () => {
  it("passes the returned job ID to the unified manager", async () => {
    const kill = vi.fn().mockResolvedValue({ success: true });
    const context = { createSubTaskRunner: vi.fn(), backgroundSubTask: vi.fn(), backgroundJobManager: { kill } } as unknown as ToolCallOptions;
    const start = newTask(context);
    const started = await start({ description: "Research", prompt: "Read files", background: true, _meta: { uid: "0x123456" } }, { toolCallId: "start" } as Parameters<typeof start>[1]);
    expect(started.backgroundJobId).toBe("bgjob-task-0x123456");
    expect(started.result).toContain("backgroundJobId: bgjob-task-0x123456");
    const stop = killBackgroundJob(context);
    expect(await stop({ backgroundJobId: started.backgroundJobId! }, {} as Parameters<typeof stop>[1])).toEqual({ success: true });
    // Its own kill: the tool result already tells the agent what happened.
    expect(kill).toHaveBeenCalledWith("bgjob-task-0x123456", { notify: false });
  });
});

describe("isolated newTask", () => {
  const worktree = { path: "/repo.worktree/subagent-worker", branch: "subagent/worker", baseCommit: "abc" };

  beforeEach(() => {
    worktreeMocks.createSubagentWorktree.mockReset().mockResolvedValue(worktree);
    worktreeMocks.finalizeSubagentWorktree.mockReset();
  });

  it("runs a foreground subagent in its worktree and reports kept changes", async () => {
    worktreeMocks.finalizeSubagentWorktree.mockResolvedValue({ worktree, removed: false });
    const run = vi.fn().mockResolvedValue(undefined);
    const createSubTaskRunner = vi.fn(() => ({ run, state: { messages: [] } }));
    const execute = newTask({ createSubTaskRunner } as unknown as ToolCallOptions);
    const result = await execute({ description: "Fix", prompt: "Fix it", background: false, isolation: "worktree", _meta: { uid: "worker" } }, { toolCallId: "call", cwd: "/repo" } as Parameters<typeof execute>[1]);
    expect(worktreeMocks.createSubagentWorktree).toHaveBeenCalledWith("/repo", "worker");
    expect(createSubTaskRunner).toHaveBeenCalledWith("worker", expect.objectContaining({ cwd: worktree.path }));
    expect(worktreeMocks.finalizeSubagentWorktree).toHaveBeenCalledWith("/repo", "worker");
    expect(result.result).toContain(`isolated worktree at ${worktree.path} (branch ${worktree.branch})`);
  });

  it("reports a removed worktree when the subagent made no changes", async () => {
    worktreeMocks.finalizeSubagentWorktree.mockResolvedValue({ worktree, removed: true });
    const createSubTaskRunner = vi.fn(() => ({ run: vi.fn().mockResolvedValue(undefined), state: { messages: [] } }));
    const execute = newTask({ createSubTaskRunner } as unknown as ToolCallOptions);
    const result = await execute({ description: "Fix", prompt: "Fix it", background: false, isolation: "worktree", _meta: { uid: "worker" } }, { toolCallId: "call", cwd: "/repo" } as Parameters<typeof execute>[1]);
    expect(result.result).toContain("worktree was removed");
  });

  it("creates the worktree before handing a subagent to the background", async () => {
    const backgroundSubTask = vi.fn().mockResolvedValue(undefined);
    const execute = newTask({ createSubTaskRunner: vi.fn(), backgroundSubTask } as unknown as ToolCallOptions);
    const result = await execute({ description: "Fix", prompt: "Fix it", isolation: "worktree", _meta: { uid: "worker" } }, { toolCallId: "call", cwd: "/repo" } as Parameters<typeof execute>[1]);
    expect(worktreeMocks.createSubagentWorktree.mock.invocationCallOrder[0]).toBeLessThan(backgroundSubTask.mock.invocationCallOrder[0]);
    expect(worktreeMocks.finalizeSubagentWorktree).not.toHaveBeenCalled();
    expect(result.result).toContain(`isolated worktree at ${worktree.path}`);
  });
});
