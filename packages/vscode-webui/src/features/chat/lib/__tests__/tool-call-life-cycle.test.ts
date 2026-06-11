import { describe, expect, it, vi } from "vitest";
import { ManagedToolCallLifeCycle } from "../tool-call-life-cycle";

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {},
}));

vi.mock("../create-fork-agent", () => ({
  createForkAgent: vi.fn(async () => ({
    taskId: "todo-audit-task",
    cwd: "/repo",
    label: "todo-audit",
  })),
}));

function makeStore() {
  return {
    storeId: "store-1",
    subscribe: vi.fn(() => vi.fn()),
    query: vi.fn(() => ({
      cwd: "/repo",
      todos: [
        {
          id: "todo-1",
          content: "finish the task",
          status: "in-progress",
          priority: "medium",
        },
      ],
    })),
    commit: vi.fn(),
  };
}

async function makeStreamingNewTaskLifecycle(
  outerAbortSignal = new AbortController().signal,
) {
  const lifecycle = new ManagedToolCallLifeCycle(
    makeStore() as never,
    { toolName: "newTask", toolCallId: "tool-call-1" },
    outerAbortSignal,
  );

  lifecycle.execute({ _meta: { uid: "subtask-1" } });
  await vi.waitFor(() => expect(lifecycle.status).toBe("execute:streaming"));

  return lifecycle;
}

describe("ManagedToolCallLifeCycle", () => {
  it("aborts a streaming newTask without double-transitioning", async () => {
    const lifecycle = await makeStreamingNewTaskLifecycle();

    expect(() => lifecycle.abort("user-abort")).not.toThrow();
    expect(lifecycle.status).toBe("complete");
    expect(lifecycle.complete.reason).toBe("user-abort");
  });

  it("completes a streaming newTask when the outer abort signal fires", async () => {
    const outerAbortController = new AbortController();
    const lifecycle = await makeStreamingNewTaskLifecycle(
      outerAbortController.signal,
    );

    outerAbortController.abort("user-abort");

    await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
    expect(lifecycle.complete.reason).toBe("user-abort");
  });

  it("does not subscribe to newTask updates when already aborted", async () => {
    const outerAbortController = new AbortController();
    outerAbortController.abort("user-abort");
    const store = makeStore();
    const lifecycle = new ManagedToolCallLifeCycle(
      store as never,
      { toolName: "newTask", toolCallId: "tool-call-1" },
      outerAbortController.signal,
    );

    lifecycle.execute({ _meta: { uid: "subtask-1" } });

    await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
    expect(lifecycle.complete.reason).toBe("user-abort");
    expect(store.subscribe).not.toHaveBeenCalled();
  });

  it("does not subscribe to completeTodo audit updates when already aborted", async () => {
    const outerAbortController = new AbortController();
    outerAbortController.abort("user-abort");
    const store = makeStore();
    const lifecycle = new ManagedToolCallLifeCycle(
      store as never,
      { toolName: "completeTodo", toolCallId: "tool-call-1" },
      outerAbortController.signal,
    );

    lifecycle.execute({}, { taskId: "parent-task" });

    await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
    expect(lifecycle.complete.reason).toBe("user-abort");
    expect(store.subscribe).not.toHaveBeenCalled();
  });

  it("completes completeTodo with an error when subscribing to audit updates fails", async () => {
    const store = makeStore();
    store.subscribe.mockImplementation(() => {
      throw new Error('Store has been shut down (while performing "subscribe").');
    });
    const lifecycle = new ManagedToolCallLifeCycle(
      store as never,
      { toolName: "completeTodo", toolCallId: "tool-call-1" },
      new AbortController().signal,
    );

    lifecycle.execute({}, { taskId: "parent-task" });

    await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
    expect(lifecycle.complete.result).toEqual({
      error: 'Store has been shut down (while performing "subscribe").',
    });
  });
});
