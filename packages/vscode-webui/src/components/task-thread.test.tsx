import type { Message } from "@getpochi/livekit";
// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskThread, type TaskThreadSource } from "./task-thread";

const mocks = vi.hoisted(() => ({
  scrollToBottom: vi.fn(),
  resizeCallback: undefined as ResizeObserverCallback | undefined,
  formatMessages: vi.fn((messages: Message[]) => messages),
  messageListProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/components/message/message-list", () => ({
  MessageList: (props: {
    containerRef: React.RefObject<HTMLDivElement | null>;
  }) => {
    mocks.messageListProps.push(props);
    return (
      <div ref={props.containerRef}>
        <div />
      </div>
    );
  },
}));

vi.mock("@/lib/hooks/use-is-at-bottom", () => ({
  useIsAtBottom: () => ({
    isAtBottom: true,
    scrollToBottom: mocks.scrollToBottom,
  }),
}));

vi.mock("@getpochi/common", () => ({
  formatters: { ui: mocks.formatMessages },
}));

const message = {
  id: "message-1",
  role: "assistant",
  parts: [{ type: "text", text: "Finished" }],
} as Message;

function makeSource(messages: Message[]): TaskThreadSource {
  return { messages, todos: [] };
}

describe("TaskThread scrolling", () => {
  beforeEach(() => {
    mocks.scrollToBottom.mockReset();
    mocks.formatMessages.mockClear();
    mocks.messageListProps = [];
    mocks.resizeCallback = undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          mocks.resizeCallback = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  it("does not format a collapsed message list", async () => {
    render(
      <TaskThread source={makeSource([message])} showMessageList={false} />,
    );

    await waitFor(() => expect(mocks.messageListProps).toHaveLength(0));
    expect(mocks.formatMessages).not.toHaveBeenCalled();
  });

  it("scrolls after the first messages are rendered in instant mode", async () => {
    const { rerender } = render(
      <TaskThread source={makeSource([])} instantAutoScroll />,
    );
    mocks.scrollToBottom.mockClear();

    rerender(<TaskThread source={makeSource([message])} instantAutoScroll />);

    await waitFor(() => {
      expect(mocks.scrollToBottom).toHaveBeenCalledWith(false);
    });
  });

  it("keeps resize-driven scrolling pinned to the bottom in instant mode", () => {
    render(<TaskThread source={makeSource([message])} instantAutoScroll />);
    mocks.scrollToBottom.mockClear();

    act(() => mocks.resizeCallback?.([], {} as ResizeObserver));

    expect(mocks.scrollToBottom).toHaveBeenCalledWith(false);
  });

  it("preserves smooth resize-driven scrolling by default", () => {
    render(<TaskThread source={makeSource([message])} />);
    mocks.scrollToBottom.mockClear();

    act(() => mocks.resizeCallback?.([], {} as ResizeObserver));

    expect(mocks.scrollToBottom).toHaveBeenCalledWith(true);
  });

  it("passes the complete raw child task history to MessageList", () => {
    const jobMessage = (backgroundJobId: string): Message => ({
      id: backgroundJobId,
      role: "assistant",
      parts: [
        {
          type: "tool-executeCommand",
          toolCallId: backgroundJobId,
          state: "output-available",
          input: { command: "bun run test" },
          output: { output: "", _meta: { backgroundJobId } },
        },
      ],
    });
    const childMessages = [
      jobMessage("bgjob-cmd-earlier"),
      jobMessage("bgjob-cmd-latest"),
    ];

    render(<TaskThread source={makeSource(childMessages)} />);
    expect(mocks.messageListProps.at(-1)?.messages).toBe(childMessages);
  });

  it("keeps user messages when showUserMessages is true and hides only the initial prompt by default", () => {
    const messages: Message[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "Initial" }] },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "Done 1" }],
      },
      { id: "u2", role: "user", parts: [{ type: "text", text: "Follow-up" }] },
    ];

    render(<TaskThread source={makeSource(messages)} />);
    const defaultProps = mocks.messageListProps.at(-1) as {
      formatMessages: (msgs: Message[]) => Message[];
      showUserAvatar: boolean;
    };
    expect(defaultProps.showUserAvatar).toBe(false);
    expect(defaultProps.formatMessages(messages).map((m) => m.id)).toEqual([
      "a1",
      "u2",
    ]);

    render(<TaskThread source={makeSource(messages)} showUserMessages />);
    const detailProps = mocks.messageListProps.at(-1) as {
      formatMessages: (msgs: Message[]) => Message[];
      showUserAvatar: boolean;
    };
    expect(detailProps.showUserAvatar).toBe(true);
    expect(detailProps.formatMessages(messages).map((m) => m.id)).toEqual([
      "u1",
      "a1",
      "u2",
    ]);
  });
});
