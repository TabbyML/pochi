// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useHandleChatEvents, useSendMessage } from "../chat-events";

function SendMessageHarness({
  sendMessage,
}: {
  sendMessage: (payload: { text: string }) => Promise<void>;
}) {
  const emitSendMessage = useSendMessage();
  useHandleChatEvents({
    sendMessage: sendMessage as never,
  });

  return (
    <button
      type="button"
      onClick={() => emitSendMessage({ prompt: "show forecast" })}
    >
      send
    </button>
  );
}

describe("chat events", () => {
  it("sends event-generated messages through the provided sendMessage function", async () => {
    const sendMessage = vi.fn(async () => {});

    const { getByRole } = render(
      <SendMessageHarness sendMessage={sendMessage} />,
    );

    await act(async () => {
      getByRole("button").click();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ text: "show forecast" });
    });
  });
});
