import { describe, expect, it, vi } from "vitest";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { ManagedToolCallLifeCycle } from "../tool-call-life-cycle";

vi.mock("@/lib/vscode", () => ({
  vscodeHost: { readBackgroundTaskState: vi.fn(async () => ({ setBackgroundTaskState: vi.fn() })) },
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
      error: "Todo audit failed",
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

describe("background subagent job cancellation", () => {
  it.each([true, false])("validates job ownership before stopping (owned: %s)", async (owned) => {
    const commit = vi.fn();
    const store = { storeId: "store", commit, query: vi.fn(() => ({ id: "0x123456", parentId: owned ? "parent" : "other", background: true, status: "pending-model" })) };
    const lifecycle = new ManagedToolCallLifeCycle(store as never, { toolName: "killBackgroundJob", toolCallId: "kill" }, new AbortController().signal);
    lifecycle.execute({ backgroundJobId: "bgjob-task-0x123456" }, { taskId: "parent" });
    await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
    if (owned) {
      expect(lifecycle.complete.result).toEqual({ success: true });
      expect(commit).toHaveBeenCalledWith(expect.objectContaining({ args: expect.objectContaining({ id: "0x123456", error: expect.objectContaining({ kind: "AbortError" }) }) }));
    } else {
      expect(lifecycle.complete.result).toEqual({ error: expect.stringContaining("not found") });
      expect(commit).not.toHaveBeenCalled();
    }
  });
});


describe("foreground background handoff", () => {
  async function setup() {
    const task = { id: "subtask-1", parentId: "parent", status: "pending-tool", background: false };
    const store = { ...makeStore(), query: vi.fn(() => task), commit: vi.fn(() => { task.background = true; }) };
    const lifecycle = new ManagedToolCallLifeCycle(store as never, { toolName: "newTask", toolCallId: "call" }, new AbortController().signal);
    lifecycle.execute({ _meta: { uid: task.id } });
    await vi.waitFor(() => expect(lifecycle.status).toBe("execute:streaming"));
    return { lifecycle, store, task };
  }

  it("waits for foreground completion and coalesces repeated clicks", async () => {
    const { lifecycle, store, task } = await setup();
    let finish!: () => void;
    const stop = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const result = lifecycle.moveToBackground(task.id, "explore", stop);
    expect(lifecycle.moveToBackground(task.id, "explore", stop)).toBe(result);
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(store.commit).not.toHaveBeenCalled();
    expect(lifecycle.status).toBe("execute:streaming");
    finish();
    await result;
    expect(store.commit).toHaveBeenCalledOnce();
    expect(lifecycle.complete.result).toEqual(expect.objectContaining({ backgroundJobId: "bgjob-task-subtask-1" }));
  });

  it("reports a stop failure without starting background execution", async () => {
    const { lifecycle, store, task } = await setup();
    await expect(lifecycle.moveToBackground(task.id, "explore", async () => { throw new Error("stop failed"); })).rejects.toThrow("stop failed");
    expect(store.commit).not.toHaveBeenCalled();
    expect(lifecycle.complete.result).toEqual({ error: "stop failed" });
  });

  it("does not hand off after cancellation while stopping", async () => {
    const { lifecycle, store, task } = await setup();
    await expect(lifecycle.moveToBackground(task.id, "explore", async () => { lifecycle.abort(); })).rejects.toThrow("cancelled");
    expect(store.commit).not.toHaveBeenCalled();
    expect(lifecycle.complete.reason).toBe("user-abort");
  });

  it("fails on timeout instead of starting a second executor", async () => {
    const { lifecycle, store, task } = await setup();
    vi.useFakeTimers();
    try {
      const result = lifecycle.moveToBackground(task.id, "explore", () => new Promise<void>(() => {}));
      const rejected = expect(result).rejects.toThrow("Timed out");
      await vi.advanceTimersByTimeAsync(10000);
      await rejected;
      expect(store.commit).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
