import { vscodeHost } from "@/lib/vscode";
import type { Task } from "@getpochi/livekit";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeepTaskEditor } from "./use-keep-task-editor";

vi.mock("@/lib/vscode", () => ({
  vscodeHost: { openTaskInPanel: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useKeepTaskEditor", () => {
  it("keeps an unused empty panel in preview mode", () => {
    const { rerender } = renderHook(() => useKeepTaskEditor());

    rerender();

    expect(vscodeHost.openTaskInPanel).not.toHaveBeenCalled();
  });

  it.each(["pending-input", "pending-model", "failed"] as const)(
    "pins a lazily created task when its first observed status is %s",
    (status) => {
      const { rerender } = renderHook(
        ({ task }: { task: Task | undefined }) => useKeepTaskEditor(task),
        { initialProps: { task: undefined as Task | undefined } },
      );

      // React can batch task creation with the first stream or preparation
      // failure, so the intermediate pending-input state need not render.
      rerender({ task: makeTask(status) });

      expect(vscodeHost.openTaskInPanel).toHaveBeenCalledExactlyOnceWith(
        { type: "open-task", uid: "task-1", cwd: "/workspace" },
        { keepEditor: true },
      );

      rerender({ task: makeTask(status) });
      expect(vscodeHost.openTaskInPanel).toHaveBeenCalledOnce();
    },
  );

  it("keeps an existing task in preview until its status changes", () => {
    const { rerender } = renderHook(({ task }) => useKeepTaskEditor(task), {
      initialProps: { task: makeTask("completed") },
    });
    expect(vscodeHost.openTaskInPanel).not.toHaveBeenCalled();

    rerender({ task: makeTask("completed") });
    expect(vscodeHost.openTaskInPanel).not.toHaveBeenCalled();

    rerender({ task: makeTask("pending-model") });
    expect(vscodeHost.openTaskInPanel).toHaveBeenCalledExactlyOnceWith(
      { type: "open-task", uid: "task-1", cwd: "/workspace" },
      { keepEditor: true },
    );
  });
});

function makeTask(status: Task["status"]): Task {
  return { id: "task-1", cwd: "/workspace", status } as Task;
}
