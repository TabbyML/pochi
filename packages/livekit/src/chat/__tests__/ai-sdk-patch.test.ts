import {
  AbstractChat,
  type ChatInit,
  type ChatState,
  type ChatStatus,
} from "ai";
import { describe, expect, it } from "vitest";
import type { Message } from "../../types";

class TestChatState implements ChatState<Message> {
  status: ChatStatus = "ready";
  error: Error | undefined;
  messages: Message[] = [];

  pushMessage = (message: Message) => {
    this.messages = this.messages.concat(message);
  };

  popMessage = () => {
    this.messages = this.messages.slice(0, -1);
  };

  replaceMessage = (index: number, message: Message) => {
    this.messages = [
      ...this.messages.slice(0, index),
      this.snapshot(message),
      ...this.messages.slice(index + 1),
    ];
  };

  snapshot = <T>(value: T): T => structuredClone(value);
}

class TestChat extends AbstractChat<Message> {
  constructor(init: ChatInit<Message>) {
    super({ ...init, state: new TestChatState() });
  }
}

describe("ai sdk patch", () => {
  it("calls onBeforeSnapshotInMakeRequest before transport send", async () => {
    let hookCalled = false;

    const chat = new TestChat({
      id: "test-chat",
      transport: {
        sendMessages: async () => {
          throw new Error("stop after hook");
        },
        reconnectToStream: async () => null,
      },
      onError: () => {},
    });

    (
      chat as unknown as {
        onBeforeSnapshotInMakeRequest: (options: {
          abortSignal: AbortSignal;
        }) => Promise<void>;
      }
    ).onBeforeSnapshotInMakeRequest = async ({ abortSignal }) => {
      hookCalled = !abortSignal.aborted;
    };

    await chat.sendMessage({ text: "hello" });

    expect(hookCalled).toBe(true);
  });
});
