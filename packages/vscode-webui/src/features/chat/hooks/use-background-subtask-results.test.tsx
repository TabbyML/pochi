import type { Message } from "@getpochi/livekit";
// @vitest-environment jsdom
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
  createSubAgentResultNotification: (
    _store: unknown,
    task: { id: string; status: string },
  ) => ({
    taskId: task.id,
    status: task.status,
    result: "result",
  }),
}));

describe("background subagent results", () => {
  beforeEach(() => {
    state.tasks = [];
  });

  it("batches finished background tasks and excludes foreground and running tasks", () => {
    state.tasks = [
      { id: "done", background: true, status: "completed" },
      { id: "failed", background: true, status: "failed" },
      { id: "running", background: true, status: "pending-model" },
      { id: "foreground", background: false, status: "completed" },
    ];
    const onResults = vi.fn();
    const { rerender } = renderHook(() =>
      useBackgroundSubtaskResults("parent", [], onResults),
    );
    expect(onResults).toHaveBeenCalledWith([
      { taskId: "done", status: "completed", result: "result" },
      { taskId: "failed", status: "failed", result: "result" },
    ]);
    rerender();
    expect(onResults).toHaveBeenCalledTimes(1);
  });

  it("does not redeliver persisted results after remount", () => {
    state.tasks = [{ id: "done", background: true, status: "completed" }];
    const messages: Message[] = [
      {
        id: "notification",
        role: "user",
        parts: [
          {
            type: "data-subagent-results",
            data: {
              results: [
                { taskId: "done", status: "completed", result: "saved" },
              ],
            },
          },
        ],
      },
    ];
    const onResults = vi.fn();
    const { unmount } = renderHook(() =>
      useBackgroundSubtaskResults("parent", messages, onResults),
    );
    unmount();
    renderHook(() =>
      useBackgroundSubtaskResults("parent", messages, onResults),
    );
    expect(onResults).not.toHaveBeenCalled();
  });
});
