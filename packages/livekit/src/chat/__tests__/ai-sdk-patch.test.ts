import { zodSchema } from "@ai-sdk/provider-utils";
import { newTaskInputSchema } from "@getpochi/tools";
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
  onBeforeSnapshotInMakeRequest?: (options: {
    abortSignal: AbortSignal;
  }) => Promise<void>;

  constructor(init: ChatInit<Message>) {
    super({ ...init, state: new TestChatState() });
  }
}

describe("ai sdk patch", () => {
  it("converts the newTask schema with its transient custom type", () => {
    expect(zodSchema(newTaskInputSchema).jsonSchema).toMatchObject({
      properties: {
        _transient: {
          properties: {
            task: { description: "The inlined subtask result." },
          },
        },
      },
    });
  });

  it("snapshots messages after preparation replaces the history", async () => {
    const chat = new TestChat({
      transport: {
        reconnectToStream: async () => null,
        sendMessages: async ({ messages }) => {
          expect(messages.at(-1)?.parts).toEqual([
            { type: "text", text: "prepared" },
          ]);
          return new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "start" });
              controller.enqueue({ type: "text-start", id: "text" });
              controller.enqueue({
                type: "text-delta",
                id: "text",
                delta: " response",
              });
              controller.enqueue({ type: "text-end", id: "text" });
              controller.enqueue({ type: "finish" });
              controller.close();
            },
          });
        },
      },
    });
    chat.onBeforeSnapshotInMakeRequest = async () => {
      chat.messages = [
        {
          id: "prepared",
          role: "assistant",
          parts: [{ type: "text", text: "prepared" }],
        },
      ];
    };
    await chat.sendMessage({ text: "hello" });
    expect(
      chat.messages
        .at(-1)
        ?.parts.filter((part) => part.type === "text")
        .map((part) => part.text)
        .join(""),
    ).toBe("prepared response");
  });

  it("streams a continuation after a message appended by preparation", async () => {
    const chat = new TestChat({
      transport: {
        reconnectToStream: async () => null,
        sendMessages: async () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "start" });
              controller.enqueue({ type: "text-start", id: "text" });
              controller.enqueue({
                type: "text-delta",
                id: "text",
                delta: "continued",
              });
              controller.enqueue({ type: "text-end", id: "text" });
              controller.enqueue({ type: "finish" });
              controller.close();
            },
          }),
      },
    });
    chat.messages = [
      { id: "user", role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        id: "assistant",
        role: "assistant",
        parts: [{ type: "text", text: "first step" }],
      },
    ];
    chat.onBeforeSnapshotInMakeRequest = async () => {
      chat.messages = [
        ...chat.messages,
        {
          id: "notification",
          role: "user",
          parts: [{ type: "text", text: "job finished" }],
        },
      ];
    };

    // A continuation targets the last message id captured before preparation.
    await chat.sendMessage();

    expect(chat.messages.map((message) => message.id)).toEqual([
      "user",
      "assistant",
      "notification",
      expect.any(String),
    ]);
    expect(chat.messages[1].parts).toEqual([
      { type: "text", text: "first step" },
    ]);
    expect(chat.messages.at(-1)).toMatchObject({
      role: "assistant",
      parts: [{ type: "text", text: "continued", state: "done" }],
    });
  });

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

  it.each(["user", "assistant", "earlier-assistant"] as const)(
    "handles a user message appended by transport (response target: %s)",
    async (target) => {
      const chat = new TestChat({
        transport: {
          reconnectToStream: async () => null,
          sendMessages: async ({ messages }) => {
            chat.messages = [
              ...messages,
              {
                id: "environment",
                role: "user",
                parts: [
                  {
                    type: "text",
                    text: "<system-reminder>Environment</system-reminder>",
                  },
                ],
              },
            ];
            return new ReadableStream({
              start(controller) {
                controller.enqueue({ type: "start" });
                controller.enqueue({ type: "text-start", id: "text" });
                controller.enqueue({
                  type: "text-delta",
                  id: "text",
                  delta: "continued",
                });
                controller.enqueue({ type: "text-end", id: "text" });
                controller.enqueue({ type: "finish" });
                controller.close();
              },
            });
          },
        },
      });
      chat.messages = [
        { id: "user", role: "user", parts: [{ type: "text", text: "hi" }] },
        {
          id: "assistant",
          role: "assistant",
          parts: [
            target === "earlier-assistant"
              ? {
                  type: "tool-readFile",
                  toolCallId: "read-1",
                  state: "approval-responded",
                  input: { path: "README.md" },
                  approval: { id: "approval", approved: true },
                }
              : {
                  type: "tool-readFile",
                  toolCallId: "read-1",
                  state: "output-available",
                  input: { path: "README.md" },
                  output: {
                    content: "contents",
                    isTruncated: false,
                    filePath: "README.md",
                  },
                },
          ],
        },
      ];
      if (target !== "assistant") {
        chat.messages = [
          ...chat.messages,
          {
            id: "follow-up",
            role: "user",
            parts: [{ type: "text", text: "continue" }],
          },
        ];
      }
      const original = structuredClone(chat.messages);

      await chat.sendMessage();

      expect(chat.status).toBe("ready");
      if (target === "earlier-assistant") {
        // Explicit approval continuations must keep their original target.
        expect(chat.messages.map(({ id }) => id)).toEqual([
          "user",
          "assistant",
          "follow-up",
          "environment",
        ]);
        expect(chat.messages[1].parts.at(-1)).toMatchObject({
          type: "text",
          text: "continued",
        });
      } else {
        expect(chat.messages.slice(0, original.length)).toEqual(original);
        expect(chat.messages).toHaveLength(original.length + 2);
        const response = chat.messages.at(-1)!;
        expect(original.some(({ id }) => id === response.id)).toBe(false);
        expect(response.parts).toEqual([
          { type: "text", text: "continued", state: "done" },
        ]);
      }
    },
  );
});
