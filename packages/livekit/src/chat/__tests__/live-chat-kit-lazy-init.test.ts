import { Chat } from "@ai-sdk/react";
import { describe, expect, it, vi } from "vitest";
import type { BlobStore, LiveKitStore, Message, Task } from "../..";
import type { PrepareRequestGetters } from "../flexible-chat-transport";
import { LiveChatKit } from "../live-chat-kit";

describe("LiveChatKit lazy initialization", () => {
  it("does not persist an unused panel even when its cwd is known", () => {
    const { chatKit, commit } = makeChatKit({ cwd: "/workspace" });

    expect(chatKit.inited).toBe(false);
    expect(chatKit.messages).toEqual([]);
    expect(commit).not.toHaveBeenCalled();
  });

  it("creates a task only once when ensureInited is called repeatedly", () => {
    const { chatKit, commit } = makeChatKit();

    chatKit.ensureInited("/workspace");
    chatKit.ensureInited("/workspace");

    expect(commit).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        name: "v1.TaskInited",
        args: expect.objectContaining({ id: "task-1", cwd: "/workspace" }),
      }),
    );
  });

  it("keeps an already created task untouched", () => {
    const { chatKit, commit } = makeChatKit({ taskExists: true });

    chatKit.ensureInited("/workspace");

    expect(commit).not.toHaveBeenCalled();
  });

  it.each(["getEnvironment", "getAutoMemory"] as const)(
    "preserves the first message and failed task when %s rejects",
    async (getter) => {
      const error = new Error("Request preparation failed");
      const { chatKit, commit } = makeChatKit({
        cwd: "/workspace",
        getters: {
          [getter]: async () => {
            throw error;
          },
        },
      });

      await chatKit.chat.sendMessage({
        parts: [{ type: "text", text: "First request" }],
      });

      expect(chatKit.chat.status).toBe("error");
      expect(chatKit.task).toMatchObject({
        id: "task-1",
        cwd: "/workspace",
        status: "failed",
        error: { message: error.message },
      });
      expect(chatKit.messages).toEqual([
        expect.objectContaining({
          role: "user",
          parts: [{ type: "text", text: "First request" }],
        }),
      ]);
      expect(commit.mock.calls.map(([event]) => event.name)).toEqual([
        "v1.TaskInited",
        "v1.ChatStreamFailed",
      ]);

      await chatKit.chat.sendMessage();
      expect(
        commit.mock.calls.filter(([event]) => event.name === "v1.TaskInited"),
      ).toHaveLength(1);
    },
  );
});

function makeChatKit({
  taskExists = false,
  cwd,
  getters,
}: {
  taskExists?: boolean;
  cwd?: string;
  getters?: Partial<PrepareRequestGetters>;
} = {}) {
  type TestTask = Pick<Task, "id" | "cwd" | "status" | "error">;
  let task: TestTask | undefined = taskExists
    ? { id: "task-1", cwd: "/workspace", status: "pending-input", error: null }
    : undefined;
  const messages = new Map<string, Message>();
  // Mirror the task INSERT and failure UPDATE used by the materializers, so
  // a failure committed without a task row cannot accidentally create one.
  const commit = vi.fn(
    (event: { name: string; args: Record<string, unknown> }) => {
      if (event.name === "v1.TaskInited") {
        task = {
          id: event.args.id as string,
          cwd: (event.args.cwd as string | undefined) ?? null,
          status: "pending-input",
          error: null,
        };
      } else if (event.name === "v1.ChatStreamFailed") {
        if (task) {
          task = {
            ...task,
            status: "failed",
            error: event.args.error as Task["error"],
          };
        }
        const message = event.args.data as Message | null;
        if (message) messages.set(message.id, message);
      }
    },
  );
  const store = {
    storeId: crypto.randomUUID(),
    query: (query: { label?: string }) => {
      if (query.label === "messages") {
        return [...messages.values()].map((data) => ({ data }));
      }
      if (query.label === "task") return task;
      // The `inited` getter counts the task rows.
      return task ? 1 : 0;
    },
    subscribe: () => () => {},
    commit,
  } as unknown as LiveKitStore;

  const chatKit = new LiveChatKit({
    taskId: "task-1",
    cwd,
    store,
    blobStore: {} as BlobStore,
    chatClass: Chat<Message>,
    getters: {
      getLLM: () => ({ id: "test-model" }) as never,
      ...getters,
    },
  });

  return { chatKit, commit };
}
