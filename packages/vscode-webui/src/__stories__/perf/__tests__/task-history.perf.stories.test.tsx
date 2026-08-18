import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import taskHistoryMeta, {
  Full,
  Paged,
  TaskHistoryPerfStory,
} from "../task-history.perf.stories";

const mocks = vi.hoisted(() => ({
  useScrollToBottom: vi.fn(),
}));

vi.mock("@getpochi/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@getpochi/common")>();
  return {
    ...original,
    formatters: { ui: <T,>(messages: T) => messages },
  };
});

vi.mock("../../../features/chat/components/chat-area", () => ({
  ChatArea: (props: {
    messages: Array<{ id: string }>;
    messagesContainerRef?: React.RefObject<HTMLDivElement | null>;
  }) => (
    <div ref={props.messagesContainerRef} data-testid="chat-area">
      {props.messages.map((message) => (
        <div key={message.id}>{message.id}</div>
      ))}
    </div>
  ),
}));

vi.mock("../../../features/chat/hooks/use-scroll-to-bottom", () => ({
  useScrollToBottom: mocks.useScrollToBottom,
}));

describe("TaskHistory performance story", () => {
  beforeEach(() => {
    mocks.useScrollToBottom.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("uses the sustained long-history pressure defaults", () => {
    expect(taskHistoryMeta.args).toMatchObject({
      initialMessageCount: 300,
      assistantPartsPerMessage: 30,
      streamChunkSize: 32,
      streamIntervalMs: 50,
    });
    expect(Full.args?.renderAllMessages).toBe(true);
    expect(Paged.args?.renderAllMessages).toBe(false);
  });

  it("makes append and stream updates visible and wires task auto-scroll", async () => {
    renderStory();

    fireEvent.click(screen.getByRole("button", { name: "Append turn" }));

    await waitFor(() => {
      expect(screen.getByTestId("task-history-message-count").textContent).toBe(
        "6",
      );
    });
    expect(
      mocks.useScrollToBottom.mock.calls.some(
        ([options]) => options.lastUserMessageId === "task-history-turn-2-user",
      ),
    ).toBe(true);
    expect(
      await screen.findByText("append user + assistant turn", undefined, {
        timeout: 2_000,
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Stream tick" }));

    await waitFor(() => {
      expect(screen.getByTestId("task-history-update-count").textContent).toBe(
        "1",
      );
    });
    expect(
      await screen.findByText("assistant stream tick", undefined, {
        timeout: 2_000,
      }),
    ).toBeTruthy();
  });

  it("settles an in-flight stream measurement when the story unmounts", async () => {
    let animationFrameCallCount = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrameCallCount += 1;
      return window.setTimeout(() => callback(performance.now()), 16);
    });
    const view = renderStory();

    fireEvent.click(screen.getByRole("button", { name: "Stream tick" }));
    view.unmount();

    await new Promise((resolve) => window.setTimeout(resolve, 100));
    const settledCallCount = animationFrameCallCount;
    await new Promise((resolve) => window.setTimeout(resolve, 100));

    expect(animationFrameCallCount).toBe(settledCallCount);
  });
});

function renderStory() {
  return render(
    <TaskHistoryPerfStory
      initialMessageCount={4}
      assistantPartsPerMessage={10}
      partTextLength={20}
      streamChunkSize={8}
      streamIntervalMs={250}
    />,
  );
}
