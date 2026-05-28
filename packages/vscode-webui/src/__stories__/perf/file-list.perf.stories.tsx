import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getBaseName, isFolder } from "@/lib/utils/file";
import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useRef, useState } from "react";
import { FileIcon } from "../../features/tools/components/file-icon";
import {
  FileList,
  type FileListMatch,
} from "../../features/tools/components/file-list";
import { makeFileMatches } from "./perf-data";
import {
  ComparisonPanel,
  MeasuredProfiler,
  useAutoMeasureOnMount,
  usePerfHarness,
} from "./perf-harness";

function BaselineFileList({
  matches,
  showBaseName = true,
}: {
  matches: FileListMatch[];
  showBaseName?: boolean;
}) {
  if (matches.length === 0) {
    return null;
  }

  return (
    <ScrollArea className="flex max-h-[100px] flex-col gap-1 rounded border p-1">
      {matches.map((match, index) => (
        <div
          key={match.file + (match.line ?? "") + index}
          className="cursor-pointer truncate rounded py-0.5 hover:bg-accent/50"
          title={match.context}
        >
          <span className="truncate px-1 font-semibold text-foreground">
            <FileIcon
              path={match.file}
              className="mr-1 ml-0.5 text-xl/4"
              defaultIconClassName="ml-0 mr-0.5"
              isDirectory={isFolder(match.file)}
            />
            {showBaseName && (
              <>
                {getBaseName(match.file)}
                {match.line && (
                  <span className="truncate text-foreground/70">
                    :{match.line}
                  </span>
                )}
              </>
            )}
          </span>
          <span
            title={match.file}
            className={cn(
              showBaseName ? "text-foreground/70" : "text-foreground",
            )}
          >
            {match.label ?? match.file}
          </span>
        </div>
      ))}
    </ScrollArea>
  );
}

function FileListPerfStory({ itemCount }: { itemCount: number }) {
  const perf = usePerfHarness();
  const [baselineMounted, setBaselineMounted] = useState(false);
  const [virtualizedMounted, setVirtualizedMounted] = useState(false);
  const [baselineRenderKey, setBaselineRenderKey] = useState(0);
  const [virtualizedRenderKey, setVirtualizedRenderKey] = useState(0);
  const baselineRef = useRef<HTMLDivElement | null>(null);
  const virtualizedRef = useRef<HTMLDivElement | null>(null);
  const variants: [string, string] = ["Baseline", "Virtualized"];
  const matches = useMemo(() => makeFileMatches(itemCount), [itemCount]);

  const measureBoth = async (
    comparisonKey: string,
    baselineAction: () => void,
    virtualizedAction: () => void,
  ) => {
    await perf.measureAction(
      `${variants[0]} ${comparisonKey}`,
      baselineAction,
      {
        comparisonKey,
        variant: variants[0],
        target: baselineRef.current,
      },
    );
    await perf.measureAction(
      `${variants[1]} ${comparisonKey}`,
      virtualizedAction,
      {
        comparisonKey,
        variant: variants[1],
        target: virtualizedRef.current,
      },
    );
  };

  useAutoMeasureOnMount(() =>
    measureBoth(
      "mount file list",
      () => setBaselineMounted(true),
      () => setVirtualizedMounted(true),
    ),
  );

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
          disabled={baselineMounted && virtualizedMounted}
          onClick={() =>
            measureBoth(
              "mount file list",
              () => setBaselineMounted(true),
              () => setVirtualizedMounted(true),
            )
          }
        >
          Mount Both
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!baselineMounted && !virtualizedMounted}
          onClick={() =>
            measureBoth(
              "unmount file list",
              () => setBaselineMounted(false),
              () => setVirtualizedMounted(false),
            )
          }
        >
          Unmount Both
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!baselineMounted || !virtualizedMounted}
          onClick={() =>
            measureBoth(
              "remount file list",
              () => setBaselineRenderKey((prev) => prev + 1),
              () => setVirtualizedRenderKey((prev) => prev + 1),
            )
          }
        >
          Remount Both
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <section ref={baselineRef} className="min-w-0">
          <div className="mb-1 font-medium text-muted-foreground text-xs">
            Baseline
          </div>
          {baselineMounted && (
            <MeasuredProfiler id="BaselineFileListPerf" record={perf.record}>
              <BaselineFileList key={baselineRenderKey} matches={matches} />
            </MeasuredProfiler>
          )}
        </section>
        <section ref={virtualizedRef} className="min-w-0">
          <div className="mb-1 font-medium text-muted-foreground text-xs">
            Virtualized
          </div>
          {virtualizedMounted && (
            <MeasuredProfiler id="VirtualizedFileListPerf" record={perf.record}>
              <FileList key={virtualizedRenderKey} matches={matches} />
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

export const BaselineVsVirtualized: Story = {};
