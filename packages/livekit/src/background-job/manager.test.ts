import { describe, expect, it, vi } from "vitest";
import type { LiveKitStore, Message, Task } from "../types";
import { BackgroundJobManager } from "./manager";

function setup(task?: Partial<Task>) {
  const query = vi.fn(() => task);
  const commit = vi.fn();
  const kill = vi.fn().mockResolvedValue(undefined);
  const manager = new BackgroundJobManager({
    store: { query, commit } as unknown as LiveKitStore,
    taskId: "parent",
    commands: { kill },
  });
  return { manager, query, commit, kill };
}

describe("BackgroundJobManager", () => {
  it("combines command state with persisted task state", () => {
    const tasks = [{ id: "child", parentId: "parent", background: true, title: "Research", status: "failed", error: { kind: "AbortError" } }];
    const store = { query: () => tasks } as unknown as LiveKitStore;
    const manager = new BackgroundJobManager({ store, taskId: "parent", commands: { kill: vi.fn() } });
    const jobs = manager.getJobs({
      messages: [{ id: "message", role: "assistant", parts: [{ type: "tool-executeCommand", state: "output-available", input: { command: "echo hello" }, output: { _meta: { backgroundJobId: "bgjob-cmd-1" } } }] }] as Message[],
      notifications: [], backgroundCommands: { "bgjob-cmd-1": { isVisible: false } },
    });
    expect(jobs).toEqual([
      expect.objectContaining({ backgroundJobId: "bgjob-cmd-1", status: "running" }),
      expect.objectContaining({ backgroundJobId: "bgjob-task-child", status: "stopped", notificationPending: true }),
    ]);
  });

  it("stops an owned background task through its persisted state", async () => {
    const { manager, commit, kill } = setup({ id: "child", parentId: "parent", background: true, status: "pending-model" });
    await expect(manager.kill("bgjob-task-child")).resolves.toEqual({ success: true });
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ args: expect.objectContaining({
      id: "child", error: { kind: "AbortError", message: "Stopped by user." },
    }) }));
    expect(kill).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    { id: "child", parentId: "other", background: true, status: "pending-model" },
    { id: "child", parentId: "parent", background: false, status: "pending-model" },
  ])("rejects missing, foreign and foreground tasks", async (task) => {
    const { manager, commit, kill } = setup(task as Partial<Task> | undefined);
    await expect(manager.kill("bgjob-task-child")).rejects.toThrow("not found");
    expect(commit).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
  });

  it.each(["completed", "failed"] as const)("does not change a %s task", async (status) => {
    const { manager, commit } = setup({ id: "child", parentId: "parent", background: true, status });
    await expect(manager.kill("bgjob-task-child")).resolves.toEqual({ success: true });
    expect(commit).not.toHaveBeenCalled();
  });

  it("awaits command termination and propagates backend errors", async () => {
    const { manager, kill } = setup();
    await expect(manager.kill("bgjob-cmd-1")).resolves.toEqual({ success: true });
    expect(kill).toHaveBeenCalledWith("bgjob-cmd-1");
    kill.mockRejectedValueOnce(new Error("not found"));
    await expect(manager.kill("missing")).rejects.toThrow("not found");
    kill.mockRejectedValueOnce(new Error("Terminal refused termination"));
    await expect(manager.kill("bgjob-cmd-1")).rejects.toThrow("Terminal refused termination");
    kill.mockRejectedValueOnce(new Error("Disconnected"));
    await expect(manager.kill("bgjob-cmd-1")).rejects.toThrow("Disconnected");
  });

  it("does not route a task to the command backend when the store is unavailable", async () => {
    const kill = vi.fn();
    const manager = new BackgroundJobManager({ taskId: "parent", store: undefined, commands: { kill } });
    await expect(manager.kill("bgjob-task-child")).rejects.toThrow("store is not available");
    expect(kill).not.toHaveBeenCalled();
  });
});
