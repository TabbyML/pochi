import type { Message } from "@getpochi/livekit";
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadyForRetryError } from "./use-ready-for-retry-error";
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

  it("clears the file-state cache before rewriting messages for retry", async () => {
    const clearFileStateCache = vi.fn();
    const setMessages = vi.fn();
    const sendMessage = vi.fn();
    const regenerate = vi.fn();

    const { result } = renderHook(() =>
      useRetry({
        messages: [createRetryableAssistantMessage()],
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
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(undefined);
    expect(regenerate).not.toHaveBeenCalled();
    expect(clearFileStateCache.mock.invocationCallOrder[0]).toBeLessThan(
      setMessages.mock.invocationCallOrder[0],
    );
  });

  it("does not continue retry after async cleanup if retry is no longer active", async () => {
    let retryActive = true;
    const clearFileStateCache = vi.fn(async () => {
      retryActive = false;
    });
    const setMessages = vi.fn();
    const sendMessage = vi.fn();

    const { result } = renderHook(() =>
      useRetry({
        messages: [createRetryableAssistantMessage()],
        setMessages,
        sendMessage,
        regenerate: vi.fn(),
        clearFileStateCache,
        canRetry: () => retryActive,
      }),
    );

    await act(async () => {
      await result.current(new Error("retry"));
    });

    expect(clearFileStateCache).toHaveBeenCalledTimes(1);
    expect(setMessages).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("uses completeTodo in the no-tool-calls reminder for active todos", async () => {
    const sendMessage = vi.fn();

    const { result } = renderHook(() =>
      useRetry({
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            parts: [{ type: "text", text: "Done." }],
          } as Message,
        ],
        setMessages: vi.fn(),
        sendMessage,
        regenerate: vi.fn(),
        getHasActiveTodos: () => true,
      }),
    );

    await act(async () => {
      await result.current(new ReadyForRetryError("no-tool-calls"));
    });

    expect(sendMessage).toHaveBeenCalledWith({
      text: expect.stringContaining("completeTodo"),
    });
    expect(sendMessage.mock.calls[0][0].text).not.toContain(
      "attemptCompletion",
    );
    expect(sendMessage.mock.calls[0][0].text).not.toContain(
      "askFollowupQuestion",
    );
  });

  it("keeps the normal no-tool-calls reminder without active todos", async () => {
    const sendMessage = vi.fn();

    const { result } = renderHook(() =>
      useRetry({
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            parts: [{ type: "text", text: "Done." }],
          } as Message,
        ],
        setMessages: vi.fn(),
        sendMessage,
        regenerate: vi.fn(),
        getHasActiveTodos: () => false,
      }),
    );

    await act(async () => {
      await result.current(new ReadyForRetryError("no-tool-calls"));
    });

    expect(sendMessage).toHaveBeenCalledWith({
      text: expect.stringContaining("attemptCompletion"),
    });
  });
});
