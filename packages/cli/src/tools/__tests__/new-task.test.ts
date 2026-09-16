import { describe, expect, it, vi } from "vitest";
import type { ToolCallOptions } from "../../types";
import { killBackgroundJob } from "../kill-background-job";
import { newTask } from "../new-task";

describe("background newTask", () => {
  it("returns a background task id without starting a foreground runner", async () => {
    const createSubTaskRunner = vi.fn();
    const backgroundSubTask = vi.fn().mockResolvedValue(undefined);
    const execute = newTask({ createSubTaskRunner, backgroundSubTask } as unknown as ToolCallOptions);
    const result = await execute({
      description: "Research", prompt: "Find the cause", background: true, _meta: { uid: "worker" },
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

  it("keeps normal subtasks in the foreground", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const createSubTaskRunner = vi.fn(() => ({ run, state: { messages: [] } }));
    const backgroundSubTask = vi.fn();
    const execute = newTask({ createSubTaskRunner, backgroundSubTask } as unknown as ToolCallOptions);
    await execute({ description: "Research", prompt: "Find the cause", _meta: { uid: "worker" } }, { toolCallId: "call" } as Parameters<typeof execute>[1]);
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
    expect(kill).toHaveBeenCalledWith("bgjob-task-0x123456");
  });
});
