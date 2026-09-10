import { describe, expect, it, vi } from "vitest";
import type { ToolCallOptions } from "../../types";
import { newTask } from "../new-task";

describe("background newTask", () => {
  it("returns a background task id without starting a foreground runner", async () => {
    const createSubTaskRunner = vi.fn();
    const backgroundSubTask = vi.fn().mockResolvedValue(undefined);
    const execute = newTask({ createSubTaskRunner, backgroundSubTask } as unknown as ToolCallOptions);
    const result = await execute({
      description: "Research", prompt: "Find the cause", runInBackground: true, _meta: { uid: "worker" },
    }, { toolCallId: "call" } as Parameters<typeof execute>[1]);
    expect(backgroundSubTask).toHaveBeenCalledWith({ taskId: "worker", agentType: undefined });
    expect(createSubTaskRunner).not.toHaveBeenCalled();
    expect(result).toMatchObject({ backgroundTaskId: "worker", result: expect.stringContaining("started in the background") });
  });

  it("reports an unavailable background executor instead of claiming success", async () => {
    const execute = newTask({ createSubTaskRunner: vi.fn() } as unknown as ToolCallOptions);
    await expect(execute({
      description: "Research", prompt: "Find the cause", runInBackground: true, _meta: { uid: "worker" },
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
