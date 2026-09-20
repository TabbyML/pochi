import {
  BackgroundJobManager,
  type BlobStore,
  type LiveKitStore,
  type Message,
} from "@getpochi/livekit";
import { useLiveChatKit } from "@getpochi/livekit/react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(cleanup);

it.each([
  undefined,
  "task-memory",
  "auto-memory",
  "auto-memory-dream",
] as const)(
  "resumes subagents but retires old fork agents (%s) on mount",
  async (useCase) => {
    const parent = {
      id: "parent",
      cwd: "/repo",
      status: "completed",
      background: false,
    };
    const child = {
      id: "child",
      parentId: "parent",
      cwd: "/repo",
      status: "pending-tool",
      background: true,
    };
    const parentMessages: Message[] = [
      {
        id: "parent-result",
        role: "assistant",
        parts: [{ type: "text", text: "The main task is done." }],
      },
    ];
    const childMessages: Message[] = [
      {
        id: "child-tool",
        role: "assistant",
        parts: [
          {
            type: "tool-readFile",
            toolCallId: "read",
            state: "input-available",
            input: { path: "README.md" },
          },
        ],
      },
    ];
    const unsubscribe = vi.fn();
    const store = {
      storeId: "saved-task-store",
      query: ({ label, hash }: { label: string; hash: string }) => {
        if (label === "runnableTasks") {
          return child.status === "pending-tool" ? [child] : [];
        }
        const isParent = hash.includes("parent");
        if (label === "backgroundTasks") return [];
        if (label === "task") return isParent ? parent : child;
        if (label === "messages") {
          return (isParent ? parentMessages : childMessages).map((data) => ({
            data,
          }));
        }
        throw new Error(`Unexpected query: ${label}`);
      },
      subscribe: vi.fn(
        (_query: { label?: string }, _callback: () => void) => unsubscribe,
      ),
      commit: vi.fn((event: { name: string }) => {
        if (event.name === "v1.TaskFailed") child.status = "failed";
      }),
    };
    let ready!: () => void;
    const initialization = new Promise<void>((resolve) => {
      ready = resolve;
    });
    // Keep the resumed tool in flight so no model/network mock is needed.
    const executeToolCall = vi.fn(
      ({ abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_, reject) => {
          abortSignal.addEventListener(
            "abort",
            () => reject(abortSignal.reason),
            { once: true },
          );
        }),
    );
    const manager = BackgroundJobManager.forStore(
      store as unknown as LiveKitStore,
    );
    manager.initialize({
      blobStore: {} as BlobStore,
      adaptor: {
        waitUntilReady: () => initialization,
        getRequestGetters: () => ({ getLLM: () => ({ id: "test" }) as never }),
        executeToolCall,
      },
      stateStore: {
        read: async () => ({ parentTaskId: "parent", useCase }),
        set: async () => {},
      },
    });
    const options: Parameters<typeof useLiveChatKit>[0] = {
      taskId: "parent",
      store: store as unknown as LiveKitStore,
      blobStore: {} as BlobStore,
      getters: { getLLM: () => ({ id: "test" }) as never },
      backgroundJobManager: manager,
    };

    const { result, rerender, unmount } = renderHook(() =>
      useLiveChatKit(options),
    );
    const chatKit = result.current;
    const sendParentMessage = vi.spyOn(chatKit.chat, "sendMessage");
    expect(executeToolCall).not.toHaveBeenCalled();

    await act(async () => ready());
    if (useCase !== undefined) {
      await waitFor(() => expect(child.status).toBe("failed"));
      expect(store.commit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "v1.TaskFailed",
          args: expect.objectContaining({
            id: "child",
            error: {
              kind: "AbortError",
              message: "Interrupted fork agent is not resumed.",
            },
          }),
        }),
      );
      expect(executeToolCall).not.toHaveBeenCalled();
      expect(sendParentMessage).not.toHaveBeenCalled();
      rerender();
      expect(child.status).toBe("failed");
      expect(executeToolCall).not.toHaveBeenCalled();
      unmount();
      await manager.dispose();
      await waitFor(() =>
        expect(unsubscribe).toHaveBeenCalledTimes(
          store.subscribe.mock.calls.length,
        ),
      );
      return;
    }
    await waitFor(() => expect(executeToolCall).toHaveBeenCalledOnce());
    expect(executeToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "child",
        toolName: "readFile",
        input: { path: "README.md" },
      }),
    );
    expect(sendParentMessage).not.toHaveBeenCalled();
    expect(chatKit.chat.messages).toEqual(parentMessages);

    rerender();
    expect(result.current).toBe(chatKit);
    expect(executeToolCall).toHaveBeenCalledOnce();
    expect(
      store.subscribe.mock.calls.filter(
        ([query]) => (query as { label: string }).label === "runnableTasks",
      ),
    ).toHaveLength(1);

    unmount();
    expect(executeToolCall.mock.calls[0][0].abortSignal.aborted).toBe(false);
    const reopened = renderHook(() => useLiveChatKit(options));
    expect(executeToolCall).toHaveBeenCalledOnce();
    reopened.unmount();
    await manager.dispose();
    await waitFor(() =>
      expect(unsubscribe).toHaveBeenCalledTimes(
        store.subscribe.mock.calls.length,
      ),
    );
    await waitFor(() =>
      expect(executeToolCall.mock.calls[0][0].abortSignal.aborted).toBe(true),
    );
  },
);
