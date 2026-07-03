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

function createRetryMessageThatStripsReadFile(): Message {
  return {
    id: "assistant-2",
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: "tool-readFile",
        toolCallId: "call-read-kept",
        state: "output-available",
        input: { path: "src/kept.ts" },
        output: { content: "const kept = 1;", isTruncated: false },
      },
      { type: "step-start" },
      {
        type: "tool-readFile",
        toolCallId: "call-read-stripped",
        state: "output-available",
        input: { path: "src/stripped.ts" },
        output: { content: "const stripped = 2;", isTruncated: false },
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
    const setMessages = vi.fn();
    const sendMessage = vi.fn();
    const regenerate = vi.fn();
    const originalMessage = createRetryableAssistantMessage();

    const { result } = renderHook(() =>
      useRetry({
        messages: [originalMessage],
        setMessages,
        sendMessage,
        regenerate,
      }),
    );

    await act(async () => {
      await result.current(new Error("retry"));
    });

    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(setMessages).toHaveBeenCalledWith([
      {
        ...originalMessage,
        parts: originalMessage.parts.slice(0, 2),
      },
    ]);
    expect(sendMessage).toHaveBeenCalledWith(undefined);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("clears file-state cache when retry preparation strips a completed readFile", async () => {
    const clearFileStateCache = vi.fn();
    const setMessages = vi.fn();
    const sendMessage = vi.fn();
    const regenerate = vi.fn();

    const { result } = renderHook(() =>
      useRetry({
        messages: [createRetryMessageThatStripsReadFile()],
        setMessages,
        sendMessage,
        regenerate,
        clearFileStateCache,
      }),
    );

    await act(async () => {
      await result.current(new Error("retry"));
    });

    expect(clearFileStateCache).toHaveBeenCalledTimes(1);
    expect(clearFileStateCache.mock.invocationCallOrder[0]).toBeLessThan(
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
