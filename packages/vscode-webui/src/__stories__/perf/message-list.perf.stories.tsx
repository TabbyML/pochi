import { MessageList } from "@/components/message/message-list";
import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useRef, useState } from "react";
import { makePerfMessages } from "./perf-data";
import {
  ComparisonPanel,
  MeasuredProfiler,
  useAutoMeasureOnMount,
  usePerfHarness,
} from "./perf-harness";

function MessageListPerfStory({
  messageCount,
  diffEvery,
  diffLineCount,
}: {
  messageCount: number;
  diffEvery: number;
  diffLineCount: number;
}) {
  const perf = usePerfHarness();
  const [offMounted, setOffMounted] = useState(false);
  const [onMounted, setOnMounted] = useState(false);
  const [offRenderKey, setOffRenderKey] = useState(0);
  const [onRenderKey, setOnRenderKey] = useState(0);
  const offRef = useRef<HTMLDivElement | null>(null);
  const onRef = useRef<HTMLDivElement | null>(null);
  const variants: [string, string] = [
    "ContentVisibilityOff",
    "ContentVisibilityOn",
  ];
  const messages = useMemo(
    () => makePerfMessages({ count: messageCount, diffEvery, diffLineCount }),
    [messageCount, diffEvery, diffLineCount],
  );

  const measureBoth = async (
    comparisonKey: string,
    offAction: () => void,
    onAction: () => void,
  ) => {
    await perf.measureAction(`${variants[0]} ${comparisonKey}`, offAction, {
      comparisonKey,
      variant: variants[0],
      target: offRef.current,
    });
    await perf.measureAction(`${variants[1]} ${comparisonKey}`, onAction, {
      comparisonKey,
      variant: variants[1],
      target: onRef.current,
    });
  };

  useAutoMeasureOnMount(() =>
    measureBoth(
      "mount message list",
      () => setOffMounted(true),
      () => setOnMounted(true),
    ),
  );

  return (
    <div ref={perf.rootRef} className="flex h-[760px] flex-col p-3">
      <ComparisonPanel
        recordsRef={perf.recordsRef}
        variants={variants}
        onClear={perf.clear}
      />
      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={offMounted && onMounted}
          onClick={() =>
            measureBoth(
              "mount message list",
              () => setOffMounted(true),
              () => setOnMounted(true),
            )
          }
        >
          Mount Both
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!offMounted && !onMounted}
          onClick={() =>
            measureBoth(
              "unmount message list",
              () => setOffMounted(false),
              () => setOnMounted(false),
            )
          }
        >
          Unmount Both
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!offMounted || !onMounted}
          onClick={() =>
            measureBoth(
              "remount message list",
              () => setOffRenderKey((prev) => prev + 1),
              () => setOnRenderKey((prev) => prev + 1),
            )
          }
        >
          Remount Both
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <section ref={offRef} className="perf-content-visibility-off min-w-0">
          <div className="mb-1 font-medium text-muted-foreground text-xs">
            ContentVisibilityOff
          </div>
          {offMounted && (
            <MeasuredProfiler
              id="ContentVisibilityOffMessageListPerf"
              record={perf.record}
            >
              <MessageList
                key={offRenderKey}
                messages={messages}
                isLoading={false}
                className="min-h-0"
                user={{ name: "User" }}
                assistant={{ name: "Pochi" }}
              />
            </MeasuredProfiler>
          )}
        </section>
        <section ref={onRef} className="min-w-0">
          <div className="mb-1 font-medium text-muted-foreground text-xs">
            ContentVisibilityOn
          </div>
          {onMounted && (
            <MeasuredProfiler
              id="ContentVisibilityOnMessageListPerf"
              record={perf.record}
            >
              <MessageList
                key={onRenderKey}
                messages={messages}
                isLoading={false}
                className="min-h-0"
                user={{ name: "User" }}
                assistant={{ name: "Pochi" }}
              />
            </MeasuredProfiler>
          )}
        </section>
      </div>
    </div>
  );
}

const meta: Meta<typeof MessageListPerfStory> = {
  title: "Perf/MessageList",
  component: MessageListPerfStory,
  args: {
    messageCount: 300,
    diffEvery: 25,
    diffLineCount: 500,
  },
  argTypes: {
    messageCount: {
      control: "select",
      options: [100, 300, 1000],
    },
    diffEvery: {
      control: "select",
      options: [0, 25, 50],
    },
    diffLineCount: {
      control: "select",
      options: [100, 500, 1000],
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const ContentVisibilityOffVsOn: Story = {};
