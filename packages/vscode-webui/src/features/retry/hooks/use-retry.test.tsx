import type { Message } from "@getpochi/livekit";
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getReadyForRetryError } from "./use-ready-for-retry-error";
import { useRetry } from "./use-retry";

function createRetryableAssistantMessage(): Message {
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: "tool-readFile",
        toolCallId: "call-read-file",
        state: "output-available",
        input: { path: "src/app.ts" },
        output: { content: "const answer = 42;", isTruncated: false },
      },
      { type: "step-start" },
      {
        type: "text",
        text: "Retrying...",
        state: "streaming",
      },
      {
        type: "tool-executeCommand",
        toolCallId: "call-exec",
        state: "input-streaming",
        input: null,
      },
    ],
  } as Message;
}

describe("useRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prepares the retry message before rewriting messages", async () => {
    const prepareLastMessageForRetry = vi.fn(async (message: Message) => ({
      ...message,
      parts: message.parts.slice(0, 2),
    }));
    const setMessages = vi.fn();
    const sendMessage = vi.fn();
    const regenerate = vi.fn();

    const { result } = renderHook(() =>
      useRetry({
        messages: [createRetryableAssistantMessage()],
        setMessages,
        sendMessage,
        regenerate,
        prepareLastMessageForRetry,
      }),
    );

    await act(async () => {
      await result.current(new Error("retry"));
    });

    expect(prepareLastMessageForRetry).toHaveBeenCalledTimes(1);
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(undefined);
    expect(regenerate).not.toHaveBeenCalled();
    expect(prepareLastMessageForRetry.mock.invocationCallOrder[0]).toBeLessThan(
      setMessages.mock.invocationCallOrder[0],
    );
  });
});

describe("getReadyForRetryError", () => {
  it("does not retry a successful attemptTodoCompletion subtask", () => {
    expect(
      getReadyForRetryError([
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "tool-newTask",
              toolCallId: "call-attempt-todo-completion",
              state: "output-available",
              input: {
                description: "Audit todo completion",
                prompt: "Audit whether the current todo is complete.",
                agentType: "attemptTodoCompletion",
              },
              output: {
                result: {
                  success: true,
                  summary: "Done.",
                  todos: [
                    {
                      id: "todo-1",
                      content: "Add one test",
                      status: "completed",
                      priority: "medium",
                    },
                  ],
                },
              },
            },
          ],
        } as unknown as Message,
      ]),
    ).toBeUndefined();
  });

  it("continues an incomplete attemptTodoCompletion subtask", () => {
    expect(
      getReadyForRetryError([
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "tool-newTask",
              toolCallId: "call-attempt-todo-completion",
              state: "output-available",
              input: {
                description: "Audit todo completion",
                prompt: "Audit whether the current todo is complete.",
                agentType: "attemptTodoCompletion",
              },
              output: {
                result: {
                  success: false,
                  summary: "More work remains.",
                  todos: [
                    {
                      id: "todo-1",
                      content: "Add one test",
                      status: "in-progress",
                      priority: "medium",
                    },
                  ],
                },
              },
            },
          ],
        } as unknown as Message,
      ]),
    ).toMatchObject({
      kind: "tool-calls",
    });
  });

  it("continues an incomplete attemptTodoCompletion subtask with a JSON string result", () => {
    expect(
      getReadyForRetryError([
        {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "tool-newTask",
              toolCallId: "call-attempt-todo-completion",
              state: "output-available",
              input: {
                description: "Audit todo completion",
                prompt: "Audit whether the current todo is complete.",
                agentType: "attemptTodoCompletion",
              },
              output: {
                result: JSON.stringify({
                  success: false,
                  summary: "More work remains.",
                  todos: [
                    {
                      id: "todo-1",
                      content: "Add one test",
                      status: "in-progress",
                      priority: "medium",
                    },
                  ],
                }),
              },
            },
          ],
        } as unknown as Message,
      ]),
    ).toMatchObject({
      kind: "tool-calls",
    });
  });
});
