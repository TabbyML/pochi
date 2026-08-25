import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messageListMeta from "../message-list.perf.stories";

const mocks = vi.hoisted(() => ({
  messageListProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../../components/message/message-list", () => ({
  MessageList: (props: Record<string, unknown>) => {
    mocks.messageListProps.push(props);
    return null;
  },
}));

vi.mock("../perf-harness", () => ({
  ComparisonPanel: () => null,
  MeasuredProfiler: ({ children }: { children: React.ReactNode }) => children,
  usePerfHarness: () => ({
    recordsRef: { current: [] },
    rootRef: { current: null },
    clear: vi.fn(),
    record: vi.fn(),
    measureAction: async (_label: string, action: () => void) => action(),
  }),
  waitForNextFrame: async () => {},
}));

describe("MessageList performance story", () => {
  beforeEach(() => {
    mocks.messageListProps = [];
  });

  it("passes raw messages with a formatter to MessageList", async () => {
    const Story = messageListMeta.component as ComponentType<{
      messageCount: number;
      assistantPartsPerMessage: number;
      partTextLength: number;
    }>;
    render(
      <Story
        messageCount={4}
        assistantPartsPerMessage={10}
        partTextLength={20}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mount Paged" }));

    await waitFor(() =>
      expect(mocks.messageListProps.length).toBeGreaterThan(0),
    );
    expect(mocks.messageListProps.at(-1)?.formatMessages).toBeTypeOf(
      "function",
    );
  });
});
