import { describe, expect, it, vi } from "vitest";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { ManagedToolCallLifeCycle } from "../tool-call-life-cycle";

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {},
}));

function makeStore() {
  return {
    storeId: "store-1",
    subscribe: vi.fn(() => vi.fn()),
  };
}

function makeCompletingStore(message: Message) {
  const subscribers: ((task: { status: string }) => void)[] = [];
  const store = {
    storeId: "store-1",
    query: vi.fn(() => [{ data: message }]),
    subscribe: vi.fn((_query, listener) => {
      subscribers.push(listener);
      return vi.fn();
    }),
  };

  return {
    store,
    completeSubtask: () => subscribers.at(-1)?.({ status: "completed" }),
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
  it("resolves attemptTodoCompletion newTask results with full todos", async () => {
    const todo: Todo = {
      id: "todo-1",
      content: "Implement todo mode",
      status: "in-progress",
      priority: "medium",
    };
    const { store, completeSubtask } = makeCompletingStore({
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-attemptCompletion",
          toolCallId: "attempt-tool-1",
          state: "output-available",
          input: {
            result: {
              summary: "Done.",
              todoUpdates: [{ id: "todo-1", status: "completed" }],
            },
          },
        },
      ],
    } as Message);
    const lifecycle = new ManagedToolCallLifeCycle(
      store as never,
      { toolName: "newTask", toolCallId: "tool-call-1" },
      new AbortController().signal,
    );

    lifecycle.execute({
      agentType: "attemptTodoCompletion",
      _meta: {
        uid: "subtask-1",
        todos: [todo],
      },
    });
    await vi.waitFor(() => expect(lifecycle.status).toBe("execute:streaming"));

    completeSubtask();

    await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
    expect(lifecycle.complete.result).toEqual({
      result: {
        summary: "Done.",
        todos: [
          {
            ...todo,
            status: "completed",
          },
        ],
      },
    });
  });

  it("completes attemptTodoCompletion newTask with an error when resolving todos fails", async () => {
    const todo: Todo = {
      id: "todo-1",
      content: "Implement todo mode",
      status: "in-progress",
      priority: "medium",
    };
    const { store, completeSubtask } = makeCompletingStore({
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-attemptCompletion",
          toolCallId: "attempt-tool-1",
          state: "output-available",
          input: {
            result: {
              summary: "Missing todo updates.",
            },
          },
        },
      ],
    } as Message);
    const lifecycle = new ManagedToolCallLifeCycle(
      store as never,
      { toolName: "newTask", toolCallId: "tool-call-1" },
      new AbortController().signal,
    );

    lifecycle.execute({
      agentType: "attemptTodoCompletion",
      _meta: {
        uid: "subtask-1",
        todos: [todo],
      },
    });
    await vi.waitFor(() => expect(lifecycle.status).toBe("execute:streaming"));

    expect(() => completeSubtask()).not.toThrow();

    await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
    expect(lifecycle.complete.result).toEqual({
      error: "Invalid attemptTodoCompletion result",
    });
  });

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
});
