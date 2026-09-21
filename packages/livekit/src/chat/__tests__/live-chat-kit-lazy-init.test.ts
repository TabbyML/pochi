import type { ChatInit } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { BlobStore, LiveKitStore, Message } from "../..";
import { LiveChatKit } from "../live-chat-kit";

describe("LiveChatKit.ensureInited", () => {
  it("creates the task for a panel that was opened without any seed content", () => {
    const { chatKit, commit } = makeChatKit({ taskExists: false });

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
});

function makeChatKit({ taskExists }: { taskExists: boolean }) {
  const commit = vi.fn();
  const store = {
    storeId: "live-chat-kit-lazy-init-test-store",
    query: (query: { label?: string }) => {
      if (query.label === "messages") return [];
      if (query.label === "task")
        return taskExists ? { id: "task-1" } : undefined;
      // The `inited` getter counts the task rows.
      return taskExists ? 1 : 0;
    },
    subscribe: () => () => {},
    commit,
  } as unknown as LiveKitStore;

  const chatKit = new LiveChatKit<FakeChat>({
    taskId: "task-1",
    store,
    blobStore: {} as BlobStore,
    chatClass: FakeChat,
    getters: {
      getLLM: () => ({ id: "test-model" }) as never,
    },
  });

  return { chatKit, commit };
}

class FakeChat {
  messages: Message[];
  constructor(init: ChatInit<Message>) {
    this.messages = init.messages ?? [];
  }
  async stop() {}
  async sendMessage() {}
}
