import type { Message } from "@getpochi/livekit";
// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskThread, type TaskThreadSource } from "./task-thread";

const mocks = vi.hoisted(() => ({
  scrollToBottom: vi.fn(),
  resizeCallback: undefined as ResizeObserverCallback | undefined,
}));

vi.mock("@/components/message/message-list", () => ({
  MessageList: ({
    containerRef,
  }: {
    containerRef: React.RefObject<HTMLDivElement | null>;
  }) => (
    <div ref={containerRef}>
      <div />
    </div>
  ),
}));

vi.mock("@/lib/hooks/use-is-at-bottom", () => ({
  useIsAtBottom: () => ({
    isAtBottom: true,
    scrollToBottom: mocks.scrollToBottom,
  }),
}));

vi.mock("@getpochi/common", () => ({
  formatters: { ui: (messages: Message[]) => messages },
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
});
