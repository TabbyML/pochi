import {
  DiffViewer,
  type DiffViewerProps,
} from "@/components/message/diff-viewer";
import { PatchDiff } from "@pierre/diffs/react";
import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useRef, useState } from "react";
import { makeAddedFilePatch, makeReplaceFilePatch } from "./perf-data";
import {
  ComparisonPanel,
  MeasuredProfiler,
  useAutoMeasureOnMount,
  usePerfHarness,
  waitForStablePerfElementCount,
} from "./perf-harness";

const baselinePatchDiffUnsafeCSS = `
  [data-separator="line-info"] {
    height: 24px;
  }`;
const baselinePatchDiffStyle = {
  "--diffs-font-family": "JetBrains Mono, monospace",
  "--diffs-font-size": "11px",
  "--diffs-line-height": 1.5,
  "--diffs-addition-color-override":
    "var(--vscode-editorGutter-addedBackground)",
  "--diffs-deletion-color-override":
    "var(--vscode-editorGutter-deletedBackground)",
  "--diffs-fg-number-addition-override":
    "var(--vscode-editorGutter-addedBackground)",
  "--diffs-fg-number-deletion-override":
    "var(--vscode-editorGutter-deletedBackground)",
} as React.CSSProperties;
const baselinePatchDiffOptions = {
  theme: "dark-plus",
  diffStyle: "unified" as const,
  overflow: "scroll" as const,
  disableFileHeader: true,
  diffIndicators: "bars" as const,
  unsafeCSS: baselinePatchDiffUnsafeCSS,
};

function BaselineDiffViewer({ patch, filePath }: DiffViewerProps) {
  return (
    <div className="diff-viewer-container overflow-hidden rounded-sm border bg-[var(--vscode-editor-background)]">
      {filePath && (
        <div className="flex items-center justify-between border-b px-2 py-1">
          <span className="truncate font-mono text-muted-foreground text-xs">
            {filePath}
          </span>
        </div>
      )}
      <div className="max-h-60 overflow-auto">
        <PatchDiff
          patch={patch}
          options={baselinePatchDiffOptions}
          style={baselinePatchDiffStyle}
        />
      </div>
    </div>
  );
}

function DiffViewerPerfStory({
  lineCount,
  patchType,
}: {
  lineCount: number;
  patchType: "added" | "replace";
}) {
  const perf = usePerfHarness();
  const [baselineMounted, setBaselineMounted] = useState(false);
  const [virtualizedMounted, setVirtualizedMounted] = useState(false);
  const [baselineRenderKey, setBaselineRenderKey] = useState(0);
  const [virtualizedRenderKey, setVirtualizedRenderKey] = useState(0);
  const baselineRef = useRef<HTMLDivElement | null>(null);
  const virtualizedRef = useRef<HTMLDivElement | null>(null);
  const variants: [string, string] = ["Baseline", "Virtualized"];
  const patch = useMemo(() => {
    return patchType === "added"
      ? makeAddedFilePatch("docs/plan.md", lineCount)
      : makeReplaceFilePatch("docs/plan.md", lineCount);
  }, [lineCount, patchType]);

  const measureBoth = async (
    comparisonKey: string,
    baselineAction: () => void,
    virtualizedAction: () => void,
    afterAction?: {
      baseline?: () => unknown | Promise<unknown>;
      virtualized?: () => unknown | Promise<unknown>;
    },
  ) => {
    await perf.measureAction(
      `${variants[0]} ${comparisonKey}`,
      baselineAction,
      {
        comparisonKey,
        variant: variants[0],
        target: baselineRef.current,
        afterAction: afterAction?.baseline,
      },
    );
    await perf.measureAction(
      `${variants[1]} ${comparisonKey}`,
      virtualizedAction,
      {
        comparisonKey,
        variant: variants[1],
        target: virtualizedRef.current,
        afterAction: afterAction?.virtualized,
      },
    );
  };

  const waitForMountedDiffViewers = {
    baseline: () =>
      waitForStablePerfElementCount(baselineRef, { minCount: 300 }),
    virtualized: () =>
      waitForStablePerfElementCount(virtualizedRef, { minCount: 300 }),
  };

  useAutoMeasureOnMount(() =>
    measureBoth(
      "cold mount diff viewer",
      () => setBaselineMounted(true),
      () => setVirtualizedMounted(true),
      waitForMountedDiffViewers,
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
              "mount diff viewer",
              () => setBaselineMounted(true),
              () => setVirtualizedMounted(true),
              waitForMountedDiffViewers,
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
              "unmount diff viewer",
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
              "remount diff viewer",
              () => setBaselineRenderKey((prev) => prev + 1),
              () => setVirtualizedRenderKey((prev) => prev + 1),
              waitForMountedDiffViewers,
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
            <MeasuredProfiler id="BaselineDiffViewerPerf" record={perf.record}>
              <BaselineDiffViewer
                key={baselineRenderKey}
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

export const BaselineVsVirtualized: Story = {};
