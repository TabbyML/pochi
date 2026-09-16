// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useHandleChatEvents,
  useSendMessage,
  useSendRetry,
} from "../chat-events";

afterEach(cleanup);

function SendMessageHarness({
  sendMessage,
  sendRetry,
}: {
  sendMessage: (payload: { text: string }) => Promise<void>;
  sendRetry?: () => void;
}) {
  const emitSendMessage = useSendMessage();
  const emitSendRetry = useSendRetry();
  useHandleChatEvents({
    sendMessage: sendMessage as never,
    sendRetry,
  });

  return (
    <>
      <button
        type="button"
        onClick={() => emitSendMessage({ prompt: "show forecast" })}
      >
        send
      </button>
      {sendRetry && (
        <button type="button" onClick={emitSendRetry}>
          retry
        </button>
      )}
    </>
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

  it("only delivers send and retry events to the mounted page after navigation", async () => {
    const parentSend = vi.fn(async () => {});
    const childSend = vi.fn(async () => {});
    const parentRetry = vi.fn();
    const childRetry = vi.fn();
    const pages = (parentVisible: boolean) =>
      parentVisible ? (
        <SendMessageHarness
          key="parent"
          sendMessage={parentSend}
          sendRetry={parentRetry}
        />
      ) : (
        <SendMessageHarness
          key="child"
          sendMessage={childSend}
          sendRetry={childRetry}
        />
      );
    const { getAllByText, rerender } = render(pages(false));
    const emit = async () => {
      await act(async () => {
        getAllByText("send")[0].click();
        getAllByText("retry")[0].click();
      });
    };
    await emit();
    expect(childSend).toHaveBeenCalledOnce();
    expect(childRetry).toHaveBeenCalledOnce();
    expect(parentSend).not.toHaveBeenCalled();
    expect(parentRetry).not.toHaveBeenCalled();

    rerender(pages(true));
    await emit();
    expect(parentSend).toHaveBeenCalledOnce();
    expect(parentRetry).toHaveBeenCalledOnce();
    expect(childSend).toHaveBeenCalledOnce();
    expect(childRetry).toHaveBeenCalledOnce();
  });
});
