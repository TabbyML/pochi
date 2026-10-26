// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  BackgroundJobManager,
  type Message,
  type Task,
} from "@getpochi/livekit";
import { makeJobStore } from "@getpochi/livekit/testing";
import type { Todo } from "@getpochi/tools";
import { blobStore } from "@/lib/remote-blob-store";
import { ManagedToolCallLifeCycle } from "../tool-call-life-cycle";

const vscodeHostMock = vi.hoisted(() => ({}) as Record<string, unknown>);

vi.mock("@/lib/vscode", () => ({
  vscodeHost: vscodeHostMock,
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

  lifecycle.execute({ background: false, _meta: { uid: "subtask-1" } });
  await vi.waitFor(() => expect(lifecycle.status).toBe("execute:streaming"));

  return lifecycle;
}

describe("ManagedToolCallLifeCycle", () => {
  it("runs an isolated foreground newTask in a worktree and reports kept changes", async () => {
    const worktree = { path: "/repo.worktree/subagent-1", branch: "subagent/1" };
    vscodeHostMock.createSubagentWorktree = vi.fn(async () => worktree);
    vscodeHostMock.finalizeSubagentWorktree = vi.fn(async () => ({
      ...worktree,
      removed: false,
    }));
    const { store, completeSubtask } = makeCompletingStore({
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-attemptCompletion",
          toolCallId: "attempt-tool-1",
          state: "output-available",
          input: { result: "Fixed." },
        },
      ],
    } as Message);
    const lifecycle = new ManagedToolCallLifeCycle(
      store as never,
      { toolName: "newTask", toolCallId: "tool-call-1" },
      new AbortController().signal,
    );

    lifecycle.execute({
      background: false,
      isolation: "worktree",
      _meta: { uid: "subtask-1" },
    });
    await vi.waitFor(() => expect(lifecycle.status).toBe("execute:streaming"));
    expect(vscodeHostMock.createSubagentWorktree).toHaveBeenCalledWith(
      "subtask-1",
    );



    completeSubtask();

    await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
    expect(vscodeHostMock.finalizeSubagentWorktree).toHaveBeenCalledWith(
      "subtask-1",
    );
    const { result } = lifecycle.complete.result as { result: string };
    expect(result).toMatch(/^Fixed\./);
    expect(result).toContain(
      `isolated worktree at ${worktree.path} (branch ${worktree.branch})`,
    );
  });

  it.each([
    { background: false, source: "lifecycle" },
    { background: false, source: "parent" },
    { background: true, source: "lifecycle" },
    { background: true, source: "parent" },
  ])(
    "cleans up cancellation during worktree creation ($source, background: $background)",
    async ({ background, source }) => {
      const worktree = {
        path: "/repo.worktree/subagent-1",
        branch: "subagent/1",
      };
      let finishCreate!: (value: typeof worktree) => void;
      vscodeHostMock.createSubagentWorktree = vi.fn(
        () =>
          new Promise<typeof worktree>((resolve) => {
            finishCreate = resolve;
          }),
      );
      const finalize = vi.fn(async () => ({ ...worktree, removed: true }));
      vscodeHostMock.finalizeSubagentWorktree = finalize;
      const outer = new AbortController();
      const lifecycle = new ManagedToolCallLifeCycle(
        makeStore() as never,
        { toolName: "newTask", toolCallId: "cancel-create" },
        outer.signal,
      );

      lifecycle.execute({
        background,
        isolation: "worktree",
        _meta: { uid: "subtask-1" },
      });
      if (source === "lifecycle") lifecycle.abort("user-abort");
      else outer.abort("user-abort");
      expect(finalize).not.toHaveBeenCalled();
      finishCreate(worktree);

      await vi.waitFor(() => {
        expect(finalize).toHaveBeenCalledExactlyOnceWith("subtask-1");
        expect(lifecycle.status).toBe("complete");
      });
      expect(lifecycle.complete.reason).toBe("user-abort");
    },
  );

  it.each(["lifecycle", "parent"])(
    "cleans up cancellation after foreground preparation (%s)",
    async (source) => {
      const worktree = {
        path: "/repo.worktree/subagent-1",
        branch: "subagent/1",
      };
      let finishCreate!: (value: typeof worktree) => void;
      const creation = new Promise<typeof worktree>((resolve) => {
        finishCreate = resolve;
      });
      vscodeHostMock.createSubagentWorktree = vi.fn(() => creation);
      const finalize = vi.fn(async () => ({ ...worktree, removed: true }));
      vscodeHostMock.finalizeSubagentWorktree = finalize;
      const outer = new AbortController();
      const lifecycle = new ManagedToolCallLifeCycle(
        makeStore() as never,
        { toolName: "newTask", toolCallId: "cancel-prepared" },
        outer.signal,
      );
      lifecycle.execute({
        background: false,
        isolation: "worktree",
        _meta: { uid: "subtask-1" },
      });
      finishCreate(worktree);
      // Let runNewTask return before cancelling, but don't start streaming yet.
      await creation;
      if (source === "lifecycle") lifecycle.abort("user-abort");
      else outer.abort("user-abort");

      await vi.waitFor(() => {
        expect(finalize).toHaveBeenCalledExactlyOnceWith("subtask-1");
        expect(lifecycle.status).toBe("complete");
      });
      expect(lifecycle.complete.reason).toBe("user-abort");
    },
  );

  it("cleans up the worktree when background handoff fails", async () => {
    const worktree = { path: "/repo.worktree/subagent-1", branch: "subagent/1" };
    vscodeHostMock.createSubagentWorktree = vi.fn(async () => worktree);
    const finalize = vi.fn(async () => ({ ...worktree, removed: true }));
    vscodeHostMock.finalizeSubagentWorktree = finalize;
    const { store } = makeJobStore();
    const manager = BackgroundJobManager.forStore(store);
    const handoff = vi
      .spyOn(manager, "backgroundSubTask")
      .mockRejectedValueOnce(new Error("handoff failed"));
    const lifecycle = new ManagedToolCallLifeCycle(
      store,
      { toolName: "newTask", toolCallId: "failed-handoff" },
      new AbortController().signal,
    );
    try {
      lifecycle.execute({ isolation: "worktree", _meta: { uid: "subtask-1" } });
      await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
      expect(finalize).toHaveBeenCalledExactlyOnceWith("subtask-1");
      expect(lifecycle.complete.result).toEqual({
        error: "Failed to execute tool: handoff failed",
      });
    } finally {
      handoff.mockRestore();
      await manager.dispose();
    }
  });

  it("leaves a successfully handed-off worktree to the background executor", async () => {
    const worktree = { path: "/repo.worktree/subagent-1", branch: "subagent/1" };
    vscodeHostMock.createSubagentWorktree = vi.fn(async () => worktree);
    const finalize = vi.fn();
    vscodeHostMock.finalizeSubagentWorktree = finalize;
    const { store } = makeJobStore();
    const manager = BackgroundJobManager.forStore(store);
    let finishHandoff!: () => void;
    const handedOff = new Promise<void>((resolve) => {
      finishHandoff = resolve;
    });
    const handoff = vi
      .spyOn(manager, "backgroundSubTask")
      .mockReturnValueOnce(handedOff);
    const lifecycle = new ManagedToolCallLifeCycle(
      store,
      { toolName: "newTask", toolCallId: "successful-handoff" },
      new AbortController().signal,
    );
    try {
      lifecycle.execute({ isolation: "worktree", _meta: { uid: "subtask-1" } });
      await vi.waitFor(() => expect(handoff).toHaveBeenCalledOnce());
      finishHandoff();
      await handedOff;
      lifecycle.abort("user-abort");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(lifecycle.complete.reason).toBe("user-abort");
      expect(finalize).not.toHaveBeenCalled();
    } finally {
      handoff.mockRestore();
      await manager.dispose();
    }
  });

  it("reports worktree creation failures without trying to finalize a missing worktree", async () => {
    vscodeHostMock.createSubagentWorktree = vi
      .fn()
      .mockRejectedValue(new Error("checkout failed"));
    const finalize = vi.fn();
    vscodeHostMock.finalizeSubagentWorktree = finalize;
    const lifecycle = new ManagedToolCallLifeCycle(
      makeStore() as never,
      { toolName: "newTask", toolCallId: "failed-create" },
      new AbortController().signal,
    );

    lifecycle.execute({ isolation: "worktree", _meta: { uid: "subtask-1" } });
    await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
    expect(finalize).not.toHaveBeenCalled();
    expect(lifecycle.complete.result).toEqual({
      error: "Failed to execute tool: checkout failed",
    });
  });

  it("completes with an error when uploading media output fails", async () => {
    const put = vi.spyOn(blobStore, "put").mockRejectedValueOnce(
      new Error("Upload failed (HTTP 429): Too many requests"),
    );
    vscodeHostMock.executeToolCall = vi.fn(async () => ({
      type: "media",
      mimeType: "image/png",
      data: btoa("png"),
    }));
    const lifecycle = new ManagedToolCallLifeCycle(
      makeStore() as never,
      { toolName: "readFile", toolCallId: "read-image" },
      new AbortController().signal,
    );
    try {
      lifecycle.execute({ path: "image.png" });

      await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
      expect(lifecycle.complete.result).toEqual({
        error:
          "Failed to execute tool: Upload failed (HTTP 429): Too many requests",
      });
    } finally {
      put.mockRestore();
    }
  });

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

describe("background subagent job lifecycle", () => {
  it.each([true, undefined])(
    "launches and registers a background subagent through the shared manager (background: %s)",
    async (background) => {
      const { store, tasks } = makeJobStore();
      tasks.set("child", {
        id: "child",
        parentId: "parent",
        background: false,
        status: "pending-model",
      } as Task);
      const manager = BackgroundJobManager.forStore(store);
      const lifecycle = new ManagedToolCallLifeCycle(
        store,
        { toolName: "newTask", toolCallId: "start" },
        new AbortController().signal,
      );
      try {
        lifecycle.execute(
          { background, agentType: "explore", _meta: { uid: "child" } },
          { taskId: "parent" },
        );
        await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
        expect(lifecycle.complete.result).toEqual(
          expect.objectContaining({ backgroundJobId: "bgjob-task-child" }),
        );
        expect(manager.getJobsForTask("parent")).toEqual([
          expect.objectContaining({
            taskId: "child",
            agentType: "explore",
            status: "running",
          }),
        ]);
      } finally {
        await manager.dispose();
      }
    },
  );

  it("does not launch after cancellation during shared state persistence", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const set = vi.fn(() => pending);
    const { store, tasks } = makeJobStore();
    tasks.set("child", {
      id: "child",
      parentId: "parent",
      background: false,
      status: "pending-model",
    } as Task);
    const manager = BackgroundJobManager.forStore(store);
    vi.spyOn(manager, "start").mockImplementation(() => {});
    manager.initialize({
      blobStore: {} as never,
      adaptor: {
        getRequestGetters: () => ({ getLLM: () => ({ id: "test" }) as never }),
        executeToolCall: vi.fn(),
      },
      stateStore: { read: () => undefined, set },
    });
    const lifecycle = new ManagedToolCallLifeCycle(
      store as never,
      { toolName: "newTask", toolCallId: "start" },
      new AbortController().signal,
    );
    lifecycle.execute(
      { background: true, _meta: { uid: "child" } },
      { taskId: "parent" },
    );
    const settled = (
      lifecycle as unknown as { state: { executeJob: Promise<void> } }
    ).state.executeJob.catch(() => undefined);
    await vi.waitFor(() => expect(set).toHaveBeenCalledOnce());
    lifecycle.abort("user-abort");
    release();
    await settled;
    expect(lifecycle.complete.reason).toBe("user-abort");
    expect(store.commit).not.toHaveBeenCalled();
    await manager.dispose();
  });

  it.each([true, false])(
    "validates job ownership before stopping (owned: %s)",
    async (owned) => {
      const commit = vi.fn();
      const store = {
        storeId: "store",
        commit,
        query: vi.fn((query: { label?: string }) =>
          query.label === "backgroundJobs" || query.label === "messages"
            ? []
            : {
                id: "0x123456",
                parentId: owned ? "parent" : "other",
                background: true,
                status: "pending-model",
              },
        ),
      };
      const lifecycle = new ManagedToolCallLifeCycle(
        store as never,
        { toolName: "killBackgroundJob", toolCallId: "kill" },
        new AbortController().signal,
      );
      lifecycle.execute(
        { backgroundJobId: "bgjob-task-0x123456" },
        { taskId: "parent" },
      );
      await vi.waitFor(() => expect(lifecycle.status).toBe("complete"));
      if (owned) {
        expect(lifecycle.complete.result).toEqual({ success: true });
        expect(commit).toHaveBeenCalledWith(
          expect.objectContaining({
            args: expect.objectContaining({
              id: "0x123456",
              error: expect.objectContaining({ kind: "AbortError" }),
            }),
          }),
        );
      } else {
        expect(lifecycle.complete.result).toEqual({
          error: expect.stringContaining("not found"),
        });
        expect(commit).not.toHaveBeenCalled();
      }
    },
  );
});

describe("foreground background handoff", () => {
  async function setup() {
    const task = {
      id: "subtask-1",
      parentId: "parent",
      status: "pending-tool",
      background: false,
    } as Task;
    const { store, tasks } = makeJobStore();
    tasks.set(task.id, task);
    const lifecycle = new ManagedToolCallLifeCycle(
      store as never,
      { toolName: "newTask", toolCallId: "call" },
      new AbortController().signal,
    );
    lifecycle.execute({ background: false, _meta: { uid: task.id } });
    await vi.waitFor(() => expect(lifecycle.status).toBe("execute:streaming"));
    return { lifecycle, store, task };
  }

  it("waits for foreground completion and coalesces repeated clicks", async () => {
    const { lifecycle, store, task } = await setup();
    let finish!: () => void;
    const stop = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const result = lifecycle.moveToBackground(task.id, "explore", stop);
    expect(lifecycle.moveToBackground(task.id, "explore", stop)).toBe(result);
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
    expect(store.commit).not.toHaveBeenCalled();
    expect(lifecycle.status).toBe("execute:streaming");
    finish();
    await result;
    expect(store.commit).toHaveBeenCalledOnce();
    expect(lifecycle.complete.result).toEqual(
      expect.objectContaining({ backgroundJobId: "bgjob-task-subtask-1" }),
    );
  });

  it("reports a stop failure without starting background execution", async () => {
    const { lifecycle, store, task } = await setup();
    await expect(
      lifecycle.moveToBackground(task.id, "explore", async () => {
        throw new Error("stop failed");
      }),
    ).rejects.toThrow("stop failed");
    expect(store.commit).not.toHaveBeenCalled();
    expect(lifecycle.complete.result).toEqual({ error: "stop failed" });
  });

  it("does not hand off after cancellation while stopping", async () => {
    const { lifecycle, store, task } = await setup();
    await expect(
      lifecycle.moveToBackground(task.id, "explore", async () => {
        lifecycle.abort();
      }),
    ).rejects.toThrow("cancelled");
    expect(store.commit).not.toHaveBeenCalled();
    expect(lifecycle.complete.reason).toBe("user-abort");
  });

  it("does not hand off after the foreground tool reports an error while stopping", async () => {
    const { lifecycle, store, task } = await setup();
    await expect(
      lifecycle.moveToBackground(task.id, "explore", async () => {
        const streaming = lifecycle.streamingResult;
        if (streaming?.toolName === "newTask")
          streaming.throws("step limit reached");
      }),
    ).rejects.toThrow("cancelled");
    expect(store.commit).not.toHaveBeenCalled();
    expect(lifecycle.complete.result).toEqual({ error: "step limit reached" });
  });

  it("fails on timeout instead of starting a second executor", async () => {
    const { lifecycle, store, task } = await setup();
    vi.useFakeTimers();
    try {
      const result = lifecycle.moveToBackground(
        task.id,
        "explore",
        () => new Promise<void>(() => {}),
      );
      const rejected = expect(result).rejects.toThrow("Timed out");
      await vi.advanceTimersByTimeAsync(10000);
      await rejected;
      expect(store.commit).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
