import {
  DiffViewer,
  type DiffViewerProps,
} from "@/components/message/diff-viewer";
import type { UITools } from "@getpochi/livekit";
import { PatchDiff } from "@pierre/diffs/react";
import type { Meta, StoryObj } from "@storybook/react";
import type { ToolUIPart } from "ai";
import { useMemo, useRef, useState } from "react";
import { FileBadge } from "../../features/tools/components/file-badge";
import { ExpandableToolContainer } from "../../features/tools/components/tool-container";
import { makeWriteToFileTool } from "./perf-data";
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

function ToolDiffPerfStory({ lineCount }: { lineCount: number }) {
  const perf = usePerfHarness();
  const [baselineMounted, setBaselineMounted] = useState(false);
  const [virtualizedMounted, setVirtualizedMounted] = useState(false);
  const [baselineExpanded, setBaselineExpanded] = useState(true);
  const [virtualizedExpanded, setVirtualizedExpanded] = useState(true);
  const [baselineRenderKey, setBaselineRenderKey] = useState(0);
  const [virtualizedRenderKey, setVirtualizedRenderKey] = useState(0);
  const baselineRef = useRef<HTMLDivElement | null>(null);
  const virtualizedRef = useRef<HTMLDivElement | null>(null);
  const variants: [string, string] = ["Baseline", "Virtualized"];
  const tool = useMemo(() => makeWriteToFileTool(lineCount), [lineCount]);

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

  const waitForMountedToolDiffs = {
    baseline: () =>
      waitForStablePerfElementCount(baselineRef, { minCount: 300 }),
    virtualized: () =>
      waitForStablePerfElementCount(virtualizedRef, { minCount: 300 }),
  };

  useAutoMeasureOnMount(() =>
    measureBoth(
      "cold mount writeToFile diff",
      () => setBaselineMounted(true),
      () => setVirtualizedMounted(true),
      waitForMountedToolDiffs,
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
              "mount writeToFile diff",
              () => setBaselineMounted(true),
              () => setVirtualizedMounted(true),
              waitForMountedToolDiffs,
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
              "unmount writeToFile diff",
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
          disabled={
            !baselineMounted ||
            !virtualizedMounted ||
            (baselineExpanded && virtualizedExpanded)
          }
          onClick={() =>
            measureBoth(
              "expand writeToFile diff",
              () => setBaselineExpanded(true),
              () => setVirtualizedExpanded(true),
            )
          }
        >
          Expand Both
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={
            !baselineMounted ||
            !virtualizedMounted ||
            (!baselineExpanded && !virtualizedExpanded)
          }
          onClick={() =>
            measureBoth(
              "collapse writeToFile diff",
              () => setBaselineExpanded(false),
              () => setVirtualizedExpanded(false),
            )
          }
        >
          Collapse Both
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!baselineMounted || !virtualizedMounted}
          onClick={() =>
            measureBoth(
              "remount expanded writeToFile diff",
              () => {
                setBaselineExpanded(true);
                setBaselineRenderKey((prev) => prev + 1);
              },
              () => {
                setVirtualizedExpanded(true);
                setVirtualizedRenderKey((prev) => prev + 1);
              },
              waitForMountedToolDiffs,
            )
          }
        >
          Remount Expanded Both
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <section ref={baselineRef} className="min-w-0">
          <div className="mb-1 font-medium text-muted-foreground text-xs">
            Baseline
          </div>
          {baselineMounted && (
            <MeasuredProfiler id="BaselineToolDiffPerf" record={perf.record}>
              <WriteToFileDiff
                key={baselineRenderKey}
                tool={tool}
                expanded={baselineExpanded}
                onToggle={setBaselineExpanded}
                Viewer={BaselineDiffViewer}
              />
            </MeasuredProfiler>
          )}
        </section>
        <section ref={virtualizedRef} className="min-w-0">
          <div className="mb-1 font-medium text-muted-foreground text-xs">
            Virtualized
          </div>
          {virtualizedMounted && (
            <MeasuredProfiler id="VirtualizedToolDiffPerf" record={perf.record}>
              <WriteToFileDiff
                key={virtualizedRenderKey}
                tool={tool}
                expanded={virtualizedExpanded}
                onToggle={setVirtualizedExpanded}
                Viewer={DiffViewer}
              />
            </MeasuredProfiler>
          )}
        </section>
      </div>
    </div>
  );
}

function WriteToFileDiff({
  tool,
  expanded,
  onToggle,
  Viewer,
}: {
  tool: ToolUIPart<UITools>;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  Viewer: React.ComponentType<DiffViewerProps>;
}) {
  const input = tool.input as { path: string };
  const output = tool.output as {
    _meta: {
      edit: string;
      editSummary: { added: number; removed: number };
    };
  };

  return (
    <ExpandableToolContainer
      title={
        <>
          Writing
          <FileBadge
            className="ml-1"
            path={input.path}
            editSummary={output._meta.editSummary}
          />
        </>
      }
      expanded={expanded}
      onToggle={onToggle}
      expandableDetail={
        <div className="my-2 ml-1 flex flex-col">
          <Viewer patch={output._meta.edit} filePath={input.path} />
        </div>
      }
    />
  );
}

const meta: Meta<typeof ToolDiffPerfStory> = {
  title: "Perf/ToolDiff",
  component: ToolDiffPerfStory,
  args: {
    lineCount: 5000,
  },
  argTypes: {
    lineCount: {
      control: "select",
      options: [1000, 5000, 10000],
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const WriteToFileBaselineVsVirtualized: Story = {};
