// @vitest-environment jsdom
import type { UseChatHelpers } from "@ai-sdk/react";
import { prompts } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInlineCompactTask } from "./use-inline-compact-task";

describe("useInlineCompactTask", () => {
  it("sends the manual compact follow-up as a system reminder", async () => {
    const sendMessage = vi
      .fn<UseChatHelpers<Message>["sendMessage"]>()
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useInlineCompactTask({ sendMessage }));

    await act(async () => {
      await result.current.inlineCompactTask();
    });

    expect(sendMessage).toHaveBeenCalledWith({
      text: expect.stringContaining("<system-reminder>"),
      metadata: {
        kind: "user",
        compact: true,
      },
    });

    const sentMessage = sendMessage.mock.calls[0]?.[0];
    if (
      !sentMessage ||
      !("text" in sentMessage) ||
      typeof sentMessage.text !== "string"
    ) {
      throw new Error("Expected inline compact to send a text message.");
    }
    expect(prompts.isSystemReminder(sentMessage.text)).toBe(true);
  });
});
