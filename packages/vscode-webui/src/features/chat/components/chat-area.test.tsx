import type { Message } from "@getpochi/livekit";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatArea } from "./chat-area";

const mocks = vi.hoisted(() => ({
  messageListProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/components/message/message-list", () => ({
  MessageList: (props: Record<string, unknown>) => {
    mocks.messageListProps.push(props);
    return null;
  },
}));

vi.mock("@/components/empty-chat-placeholder", () => ({
  EmptyChatPlaceholder: () => null,
}));

vi.mock("@/lib/hooks/use-resource-uri", () => ({
  useResourceURI: () => undefined,
}));

const message: Message = {
  id: "message-1",
  role: "user",
  metadata: { kind: "user" },
  parts: [{ type: "text", text: "hello" }],
};

describe("ChatArea", () => {
  beforeEach(() => {
    mocks.messageListProps.length = 0;
  });

  it("passes the diagnostic full-history mode to MessageList", () => {
    render(
      <ChatArea messages={[message]} isLoading={false} renderAllMessages />,
    );

    expect(mocks.messageListProps.at(-1)?.renderAllMessages).toBe(true);
  });

  it("passes raw messages with a UI formatter to MessageList", () => {
    const messages = [message];
    render(<ChatArea messages={messages} isLoading={false} />);

    const props = mocks.messageListProps.at(-1);
    expect(props?.messages).toBe(messages);
    expect(props?.formatMessages).toBeTypeOf("function");
  });

  it("passes the empty placeholder for a non-empty raw history", () => {
    render(
      <ChatArea messages={[message]} isLoading={false} hideEmptyPlaceholder />,
    );

    expect(mocks.messageListProps.at(-1)?.emptyPlaceholder).toBeTruthy();
  });

  it("keeps the empty placeholder hidden for an empty raw history", () => {
    render(<ChatArea messages={[]} isLoading={false} hideEmptyPlaceholder />);

    expect(mocks.messageListProps.at(-1)?.emptyPlaceholder).toBeUndefined();
  });
});
