import { MessageList } from "@/components/message/message-list";
import {
  MessageListPaginationConfig,
  computePageStart,
} from "@/components/message/use-message-list-pagination";
import type { Meta, StoryObj } from "@storybook/react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { makeTaskHistoryMessages, summarizeMessageRange } from "./perf-data";
import {
  ComparisonPanel,
  MeasuredProfiler,
  usePerfHarness,
  waitForNextFrame,
} from "./perf-harness";

type Variant = "Full" | "Paged";

function MessageListPerfStory({
  messageCount,
  assistantPartsPerMessage,
  partTextLength,
}: {
  messageCount: number;
  assistantPartsPerMessage: number;
  partTextLength: number;
}) {
  const perf = usePerfHarness();
  const [activeVariant, setActiveVariant] = useState<Variant | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const variants: [Variant, Variant] = ["Full", "Paged"];
  const messages = useMemo(
    () =>
      makeTaskHistoryMessages({
        messageCount,
        assistantPartsPerMessage,
        partTextLength,
      }),
    [assistantPartsPerMessage, messageCount, partTextLength],
  );
  const pagedStart = useMemo(
    () =>
      computePageStart(
        messages.map((message) => message.parts.length),
        messages.length,
        MessageListPaginationConfig.partBudget,
        MessageListPaginationConfig.minInitialMessages,
      ),
    [messages],
  );
  const summaries = useMemo(
    () => ({
      Full: summarizeMessageRange(messages, 0),
      Paged: summarizeMessageRange(messages, pagedStart),
    }),
    [messages, pagedStart],
  );

  // ChatArea normally scrolls to bottom. Do it before observing the top trigger.
  // biome-ignore lint/correctness/useExhaustiveDependencies: renderKey remounts the viewport
  useLayoutEffect(() => {
    if (activeVariant !== "Paged" || !viewportRef.current) return;
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [activeVariant, renderKey]);

  const waitForMessageCount = (expected: number) =>
    waitForStableMessageCount(listRef, expected);

  const unmountCurrent = async () => {
    setActiveVariant(null);
    await waitForMessageCount(0);
  };

  const measureVariant = async (variant: Variant) => {
    await unmountCurrent();
    const expected = summaries[variant].mountedMessageCount;
    await perf.measureAction(
      `${variant} mount ${messageCount} messages`,
      () => {
        setRenderKey((current) => current + 1);
        setActiveVariant(variant);
      },
      {
        kind: "mount",
        comparisonKey: `mount ${messageCount} messages`,
        variant,
        target: listRef.current,
        afterAction: () => waitForMessageCount(expected),
      },
    );
  };

  const run = async (action: () => Promise<void>) => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      await action();
    } finally {
      setIsRunning(false);
    }
  };

  const runComparison = () =>
    run(async () => {
      perf.clear();
      await measureVariant("Full");
      await measureVariant("Paged");
    });

  return (
    <div ref={perf.rootRef} className="flex h-[760px] flex-col p-3">
      <ComparisonPanel
        recordsRef={perf.recordsRef}
        variants={variants}
        onClear={perf.clear}
      />
      <div className="mb-2 flex flex-wrap gap-2">
        <ActionButton disabled={isRunning} onClick={() => void runComparison()}>
          Run Full → Paged
        </ActionButton>
        <ActionButton
          disabled={isRunning}
          onClick={() => void run(() => measureVariant("Full"))}
        >
          Mount Full
        </ActionButton>
        <ActionButton
          disabled={isRunning}
          onClick={() => void run(() => measureVariant("Paged"))}
        >
          Mount Paged
        </ActionButton>
        <ActionButton
          disabled={isRunning || activeVariant === null}
          onClick={() => void run(unmountCurrent)}
        >
          Unmount
        </ActionButton>
      </div>
      <div className="mb-2 overflow-x-auto rounded border text-xs">
        <table className="w-full min-w-[520px] text-left">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-2 py-1">variant</th>
              <th className="px-2 py-1">input messages</th>
              <th className="px-2 py-1">input parts</th>
              <th className="px-2 py-1">mounted messages</th>
              <th className="px-2 py-1">mounted parts</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => {
              const summary = summaries[variant];
              return (
                <tr key={variant} className="border-t">
                  <td className="px-2 py-1 font-medium">{variant}</td>
                  <td className="px-2 py-1">{summary.inputMessageCount}</td>
                  <td className="px-2 py-1">{summary.inputPartCount}</td>
                  <td className="px-2 py-1">{summary.mountedMessageCount}</td>
                  <td className="px-2 py-1">{summary.mountedPartCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mb-2 text-muted-foreground text-xs">
        Both variants use the same preformatted data. Run sequentially so the
        Full and Paged trees never coexist. Message and part counts come from
        the fixture; DOM nodes in Comparison are secondary diagnostics.
      </div>
      <section ref={listRef} className="min-h-0 flex-1 overflow-hidden">
        {activeVariant && (
          <MeasuredProfiler
            id={`${activeVariant}MessageListPerf`}
            record={perf.record}
          >
            <MessageList
              key={`${activeVariant}-${renderKey}`}
              messages={messages}
              isLoading={false}
              className="h-full min-h-0"
              user={{ name: "User" }}
              assistant={{ name: "Pochi" }}
              containerRef={viewportRef}
              renderAllMessages={activeVariant === "Full"}
            />
          </MeasuredProfiler>
        )}
      </section>
    </div>
  );
}

function ActionButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="rounded border px-2 py-1 text-xs disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

async function waitForStableMessageCount(
  rootRef: React.RefObject<ParentNode | null>,
  expected: number,
  timeoutMs = 15_000,
) {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    await waitForNextFrame();
    if (countMountedMessages(rootRef.current) !== expected) continue;
    await waitForNextFrame();
    if (countMountedMessages(rootRef.current) === expected) return;
  }

  throw new Error(`Timed out waiting for ${expected} mounted messages`);
}

function countMountedMessages(root: ParentNode | null) {
  return root?.querySelectorAll('[aria-label^="chat-message-"]').length ?? 0;
}

const meta: Meta<typeof MessageListPerfStory> = {
  title: "Perf/MessageList",
  component: MessageListPerfStory,
  args: {
    messageCount: 300,
    assistantPartsPerMessage: 30,
    partTextLength: 240,
  },
  argTypes: {
    messageCount: {
      control: "select",
      options: [100, 300, 1000],
    },
    assistantPartsPerMessage: {
      control: "select",
      options: [10, 30, 60],
    },
    partTextLength: {
      control: "select",
      options: [80, 240, 1000],
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const StaticMount: Story = {};
