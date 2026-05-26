import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useRef, useState } from "react";
import {
  FileList,
  FullFileList,
} from "../../features/tools/components/file-list";
import { makeFileMatches } from "./fixtures";
import {
  ComparisonPanel,
  MeasuredProfiler,
  usePerfHarness,
} from "./perf-harness";

function FileListPerfStory({ itemCount }: { itemCount: number }) {
  const perf = usePerfHarness();
  const [fullMounted, setFullMounted] = useState(true);
  const [cappedMounted, setCappedMounted] = useState(true);
  const [fullRenderKey, setFullRenderKey] = useState(0);
  const [cappedRenderKey, setCappedRenderKey] = useState(0);
  const fullRef = useRef<HTMLDivElement | null>(null);
  const cappedRef = useRef<HTMLDivElement | null>(null);
  const variants: [string, string] = ["Full", "Capped"];
  const matches = useMemo(() => makeFileMatches(itemCount), [itemCount]);

  const measureBoth = async (
    comparisonKey: string,
    fullAction: () => void,
    cappedAction: () => void,
  ) => {
    await perf.measureAction(`${variants[0]} ${comparisonKey}`, fullAction, {
      comparisonKey,
      variant: variants[0],
      target: fullRef.current,
    });
    await perf.measureAction(`${variants[1]} ${comparisonKey}`, cappedAction, {
      comparisonKey,
      variant: variants[1],
      target: cappedRef.current,
    });
  };

  return (
    <div ref={perf.rootRef} className="p-3">
      <ComparisonPanel
        recordsRef={perf.recordsRef}
        variants={variants}
        onClear={perf.clear}
      />
      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={fullMounted && cappedMounted}
          onClick={() =>
            measureBoth(
              "mount file list",
              () => setFullMounted(true),
              () => setCappedMounted(true),
            )
          }
        >
          Mount Both
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!fullMounted && !cappedMounted}
          onClick={() =>
            measureBoth(
              "unmount file list",
              () => setFullMounted(false),
              () => setCappedMounted(false),
            )
          }
        >
          Unmount Both
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!fullMounted || !cappedMounted}
          onClick={() =>
            measureBoth(
              "remount file list",
              () => setFullRenderKey((prev) => prev + 1),
              () => setCappedRenderKey((prev) => prev + 1),
            )
          }
        >
          Remount Both
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <section ref={fullRef} className="min-w-0">
          <div className="mb-1 font-medium text-muted-foreground text-xs">
            Full
          </div>
          {fullMounted && (
            <MeasuredProfiler
              id="FullFileListPerf"
              record={perf.record}
              comparisonKey="initial mount file list"
              variant={variants[0]}
            >
              <FullFileList key={fullRenderKey} matches={matches} />
            </MeasuredProfiler>
          )}
        </section>
        <section ref={cappedRef} className="min-w-0">
          <div className="mb-1 font-medium text-muted-foreground text-xs">
            Capped
          </div>
          {cappedMounted && (
            <MeasuredProfiler
              id="CappedFileListPerf"
              record={perf.record}
              comparisonKey="initial mount file list"
              variant={variants[1]}
            >
              <FileList key={cappedRenderKey} matches={matches} />
            </MeasuredProfiler>
          )}
        </section>
      </div>
    </div>
  );
}

const meta: Meta<typeof FileListPerfStory> = {
  title: "Perf/FileList",
  component: FileListPerfStory,
  args: {
    itemCount: 500,
  },
  argTypes: {
    itemCount: {
      control: "select",
      options: [100, 500, 1500],
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const FullVsCapped: Story = {};
