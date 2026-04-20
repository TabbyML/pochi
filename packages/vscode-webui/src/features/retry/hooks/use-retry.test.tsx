import type { Message } from "@getpochi/livekit";
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
