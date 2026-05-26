import { DiffViewer, PlainDiffViewer } from "@/components/message/diff-viewer";
import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useRef, useState } from "react";
import { makeAddedFilePatch, makeReplaceFilePatch } from "./fixtures";
import {
  ComparisonPanel,
  MeasuredProfiler,
  usePerfHarness,
} from "./perf-harness";

function DiffViewerPerfStory({
  lineCount,
  patchType,
}: {
  lineCount: number;
  patchType: "added" | "replace";
}) {
  const perf = usePerfHarness();
  const [plainMounted, setPlainMounted] = useState(true);
  const [virtualizedMounted, setVirtualizedMounted] = useState(true);
  const [plainRenderKey, setPlainRenderKey] = useState(0);
  const [virtualizedRenderKey, setVirtualizedRenderKey] = useState(0);
  const plainRef = useRef<HTMLDivElement | null>(null);
  const virtualizedRef = useRef<HTMLDivElement | null>(null);
  const variants: [string, string] = ["Plain", "Virtualized"];
  const patch = useMemo(() => {
    return patchType === "added"
      ? makeAddedFilePatch("docs/plan.md", lineCount)
      : makeReplaceFilePatch("docs/plan.md", lineCount);
  }, [lineCount, patchType]);

  const measureBoth = async (
    comparisonKey: string,
    plainAction: () => void,
    virtualizedAction: () => void,
  ) => {
    await perf.measureAction(`${variants[0]} ${comparisonKey}`, plainAction, {
      comparisonKey,
      variant: variants[0],
      target: plainRef.current,
    });
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
          disabled={plainMounted && virtualizedMounted}
          onClick={() =>
            measureBoth(
              "mount diff viewer",
              () => setPlainMounted(true),
              () => setVirtualizedMounted(true),
            )
          }
        >
          Mount Both
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!plainMounted && !virtualizedMounted}
          onClick={() =>
            measureBoth(
              "unmount diff viewer",
              () => setPlainMounted(false),
              () => setVirtualizedMounted(false),
            )
          }
        >
          Unmount Both
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!plainMounted || !virtualizedMounted}
          onClick={() =>
            measureBoth(
              "remount diff viewer",
              () => setPlainRenderKey((prev) => prev + 1),
              () => setVirtualizedRenderKey((prev) => prev + 1),
            )
          }
        >
          Remount Both
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <section ref={plainRef} className="min-w-0">
          <div className="mb-1 font-medium text-muted-foreground text-xs">
            Plain
          </div>
          {plainMounted && (
            <MeasuredProfiler
              id="PlainDiffViewerPerf"
              record={perf.record}
              comparisonKey="initial mount diff viewer"
              variant={variants[0]}
            >
              <PlainDiffViewer
                key={plainRenderKey}
                patch={patch}
                filePath="docs/plan.md"
              />
            </MeasuredProfiler>
          )}
        </section>
        <section ref={virtualizedRef} className="min-w-0">
          <div className="mb-1 font-medium text-muted-foreground text-xs">
            Virtualized
          </div>
          {virtualizedMounted && (
            <MeasuredProfiler
              id="VirtualizedDiffViewerPerf"
              record={perf.record}
              comparisonKey="initial mount diff viewer"
              variant={variants[1]}
            >
              <DiffViewer
                key={virtualizedRenderKey}
                patch={patch}
                filePath="docs/plan.md"
              />
            </MeasuredProfiler>
          )}
        </section>
      </div>
    </div>
  );
}

const meta: Meta<typeof DiffViewerPerfStory> = {
  title: "Perf/DiffViewer",
  component: DiffViewerPerfStory,
  args: {
    lineCount: 5000,
    patchType: "added",
  },
  argTypes: {
    lineCount: {
      control: "select",
      options: [1000, 5000, 10000],
    },
    patchType: {
      control: "inline-radio",
      options: ["added", "replace"],
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const PlainVsVirtualized: Story = {};
