// @vitest-environment jsdom
import type { Message } from "@getpochi/livekit";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBackgroundSubtaskResults } from "./use-background-subtask-results";

const state = vi.hoisted(() => ({
  tasks: [] as Array<{ id: string; background: boolean; status: string }>,
}));
vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({ useQuery: () => state.tasks }),
}));
vi.mock("@getpochi/livekit", () => ({
  catalog: { queries: { makeSubTaskQuery: (id: string) => id } },
  createSubAgentResultNotification: (_store: unknown, task: { id: string; status: string }) => ({
    kind: "subagent",
    notificationId: `bgjob-task-${task.id}:terminal:${task.status}`,
    backgroundJobId: `bgjob-task-${task.id}`,
    taskId: task.id,
    status: task.status,
    result: "result",
  }),
}));

const saved: Message[] = [{ id: "notification", role: "user", parts: [{
  type: "data-background-job-notification",
  data: { kind: "subagent", notificationId: "bgjob-task-done:terminal:completed", backgroundJobId: "bgjob-task-done", taskId: "done", status: "completed", result: "saved" },
}] }];

describe("background subagent results", () => {
  beforeEach(() => { state.tasks = []; });

  it("batches finished background tasks and excludes foreground and running tasks", () => {
    state.tasks = [
      { id: "done", background: true, status: "completed" },
      { id: "failed", background: true, status: "failed" },
      { id: "running", background: true, status: "pending-model" },
      { id: "foreground", background: false, status: "completed" },
    ];
    const onResults = vi.fn();
    const { rerender } = renderHook(() => useBackgroundSubtaskResults("parent", [], onResults));
    expect(onResults).toHaveBeenCalledWith([
      expect.objectContaining({ taskId: "done", status: "completed" }),
      expect.objectContaining({ taskId: "failed", status: "failed" }),
    ]);
    rerender();
    expect(onResults).toHaveBeenCalledTimes(2);
  });

  it("does not redeliver persisted results after remount", () => {
    state.tasks = [{ id: "done", background: true, status: "completed" }];
    const onResults = vi.fn();
    const { unmount } = renderHook(() => useBackgroundSubtaskResults("parent", saved, onResults));
    unmount();
    renderHook(() => useBackgroundSubtaskResults("parent", saved, onResults));
    expect(onResults).not.toHaveBeenCalled();
  });

  it("delivers a changed terminal status", () => {
    state.tasks = [{ id: "done", background: true, status: "failed" }];
    const onResults = vi.fn();
    renderHook(() => useBackgroundSubtaskResults("parent", saved, onResults));
    expect(onResults).toHaveBeenCalledWith([expect.objectContaining({ notificationId: "bgjob-task-done:terminal:failed", status: "failed" })]);
  });
});
