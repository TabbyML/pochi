import { DiffViewer, PlainDiffViewer } from "@/components/message/diff-viewer";
import type { UITools } from "@getpochi/livekit";
import type { Meta, StoryObj } from "@storybook/react";
import type { ToolUIPart } from "ai";
import { useMemo, useRef, useState } from "react";
import { FileBadge } from "../../features/tools/components/file-badge";
import { ExpandableToolContainer } from "../../features/tools/components/tool-container";
import { makeWriteToFileTool } from "./fixtures";
import {
  ComparisonPanel,
  MeasuredProfiler,
  usePerfHarness,
} from "./perf-harness";

function ToolDiffPerfStory({ lineCount }: { lineCount: number }) {
  const perf = usePerfHarness();
  const [plainMounted, setPlainMounted] = useState(true);
  const [virtualizedMounted, setVirtualizedMounted] = useState(true);
  const [plainExpanded, setPlainExpanded] = useState(true);
  const [virtualizedExpanded, setVirtualizedExpanded] = useState(true);
  const [plainRenderKey, setPlainRenderKey] = useState(0);
  const [virtualizedRenderKey, setVirtualizedRenderKey] = useState(0);
  const plainRef = useRef<HTMLDivElement | null>(null);
  const virtualizedRef = useRef<HTMLDivElement | null>(null);
  const variants: [string, string] = ["Plain", "Virtualized"];
  const tool = useMemo(() => makeWriteToFileTool(lineCount), [lineCount]);

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
              "mount writeToFile diff",
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
              "unmount writeToFile diff",
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
          disabled={
            !plainMounted ||
            !virtualizedMounted ||
            (plainExpanded && virtualizedExpanded)
          }
          onClick={() =>
            measureBoth(
              "expand writeToFile diff",
              () => setPlainExpanded(true),
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
            !plainMounted ||
            !virtualizedMounted ||
            (!plainExpanded && !virtualizedExpanded)
          }
          onClick={() =>
            measureBoth(
              "collapse writeToFile diff",
              () => setPlainExpanded(false),
              () => setVirtualizedExpanded(false),
            )
          }
        >
          Collapse Both
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={!plainMounted || !virtualizedMounted}
          onClick={() =>
            measureBoth(
              "remount expanded writeToFile diff",
              () => {
                setPlainExpanded(true);
                setPlainRenderKey((prev) => prev + 1);
              },
              () => {
                setVirtualizedExpanded(true);
                setVirtualizedRenderKey((prev) => prev + 1);
              },
            )
          }
        >
          Remount Expanded Both
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <section ref={plainRef} className="min-w-0">
          <div className="mb-1 font-medium text-muted-foreground text-xs">
            Plain
          </div>
          {plainMounted && (
            <MeasuredProfiler
              id="PlainToolDiffPerf"
              record={perf.record}
              comparisonKey="initial mount writeToFile diff"
              variant={variants[0]}
            >
              <WriteToFileDiffVariant
                key={plainRenderKey}
                tool={tool}
                expanded={plainExpanded}
                onToggle={setPlainExpanded}
                virtualized={false}
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
              id="VirtualizedToolDiffPerf"
              record={perf.record}
              comparisonKey="initial mount writeToFile diff"
              variant={variants[1]}
            >
              <WriteToFileDiffVariant
                key={virtualizedRenderKey}
                tool={tool}
                expanded={virtualizedExpanded}
                onToggle={setVirtualizedExpanded}
                virtualized={true}
              />
            </MeasuredProfiler>
          )}
        </section>
      </div>
    </div>
  );
}

function WriteToFileDiffVariant({
  tool,
  expanded,
  onToggle,
  virtualized,
}: {
  tool: ToolUIPart<UITools>;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
  virtualized: boolean;
}) {
  const input = tool.input as { path: string };
  const output = tool.output as {
    _meta: {
      edit: string;
      editSummary: { added: number; removed: number };
    };
  };
  const Viewer = virtualized ? DiffViewer : PlainDiffViewer;

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
      renderExpandableDetail={() => (
        <div className="my-2 ml-1 flex flex-col">
          <Viewer patch={output._meta.edit} filePath={input.path} />
        </div>
      )}
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

export const WriteToFilePlainVsVirtualized: Story = {};
