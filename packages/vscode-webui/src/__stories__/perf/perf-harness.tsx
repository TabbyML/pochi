/* eslint-disable i18next/no-literal-string */

import {
  Profiler,
  type ProfilerOnRenderCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface PerfRecord {
  label: string;
  variant?: string;
  comparisonKey?: string;
  mountActualDuration?: number;
  updateActualDuration?: number;
  baseDuration?: number;
  actionMs?: number;
  expandMs?: number;
  collapseMs?: number;
  nodeCountBefore?: number;
  nodeCountAfter?: number;
  longTaskCount?: number;
  longTaskTotalMs?: number;
  longTaskMaxMs?: number;
  worstFrameMs?: number;
  droppedFramesOver32ms?: number;
  droppedFramesOver50ms?: number;
}

type LongTaskEntry = {
  startTime: number;
  duration: number;
};

type FrameSample = {
  worstFrameMs: number;
  droppedFramesOver32ms: number;
  droppedFramesOver50ms: number;
};

interface PerfHarnessValue {
  recordsRef: React.RefObject<PerfRecord[]>;
  record: (record: PerfRecord) => void;
  clear: () => void;
  measureAction: (
    label: string,
    action: () => void,
    options?: {
      kind?: "expand" | "collapse" | "mount" | "unmount" | "remount" | "update";
      variant?: string;
      comparisonKey?: string;
      target?: HTMLElement | null;
      afterAction?: () => unknown | Promise<unknown>;
    },
  ) => Promise<void>;
  sampleFrames: (label: string, durationMs?: number) => Promise<void>;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

export function usePerfHarness(): PerfHarnessValue {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const recordsRef = useRef<PerfRecord[]>([]);
  const longTasks = useRef<LongTaskEntry[]>([]);

  useEffect(() => {
    if (
      typeof PerformanceObserver === "undefined" ||
      !PerformanceObserver.supportedEntryTypes?.includes("longtask")
    ) {
      return;
    }

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.current.push({
          startTime: entry.startTime,
          duration: entry.duration,
        });
      }
    });

    observer.observe({ type: "longtask", buffered: true });
    return () => observer.disconnect();
  }, []);

  const record = (record: PerfRecord) => {
    recordsRef.current = [record, ...recordsRef.current].slice(0, 30);
  };

  const clear = () => {
    longTasks.current = [];
    recordsRef.current = [];
  };

  const measureAction: PerfHarnessValue["measureAction"] = async (
    label,
    action,
    options,
  ) => {
    const root = options?.target ?? rootRef.current ?? document.body;
    const startedAt = performance.now();
    const nodeCountBefore = countElements(root);
    const longTaskStartIndex = longTasks.current.length;

    action();
    const settlePromise = Promise.resolve(
      options?.afterAction?.() ?? waitForFrameCount(2),
    );
    const frameSample = await sampleFramesUntilSettled(
      settlePromise,
      startedAt,
    );

    const elapsed = performance.now() - startedAt;
    const nodeCountAfter = countElements(root);
    const actionLongTasks = longTasks.current.slice(longTaskStartIndex);
    const longTaskTotalMs = actionLongTasks.reduce(
      (sum, entry) => sum + entry.duration,
      0,
    );
    const longTaskMaxMs = actionLongTasks.reduce(
      (max, entry) => Math.max(max, entry.duration),
      0,
    );

    record({
      label,
      variant: options?.variant,
      comparisonKey: options?.comparisonKey,
      actionMs: elapsed,
      nodeCountBefore,
      nodeCountAfter,
      longTaskCount: actionLongTasks.length,
      longTaskTotalMs,
      longTaskMaxMs,
      ...frameSample,
      expandMs: options?.kind === "expand" ? elapsed : undefined,
      collapseMs: options?.kind === "collapse" ? elapsed : undefined,
      updateActualDuration: options?.kind === "update" ? elapsed : undefined,
    });
  };

  const sampleFrames = async (label: string, durationMs = 2000) => {
    const result = await sampleFrameGaps(durationMs);
    record({ label, ...result });
  };

  return {
    recordsRef,
    record,
    clear,
    measureAction,
    sampleFrames,
    rootRef,
  };
}

export function useAutoMeasureOnMount(
  run: () => void | Promise<void>,
  delayMs = 0,
) {
  const runRef = useRef(run);

  useEffect(() => {
    runRef.current = run;
  }, [run]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void runRef.current();
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs]);
}

export async function waitForPerfElementCount(
  rootRef: React.RefObject<ParentNode | null>,
  minCount: number,
  timeoutMs = 2000,
) {
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    const root = rootRef.current;
    if (root && countElements(root) >= minCount) {
      return true;
    }

    await waitForNextFrame();
  }

  return false;
}

export async function waitForStablePerfElementCount(
  rootRef: React.RefObject<ParentNode | null>,
  {
    minCount,
    stableMs = 120,
    stableFrames = 3,
    timeoutMs = 5000,
  }: {
    minCount: number;
    stableMs?: number;
    stableFrames?: number;
    timeoutMs?: number;
  },
) {
  const startedAt = performance.now();
  let lastCount = -1;
  let lastChangedAt = startedAt;
  let stableFrameCount = 0;

  while (performance.now() - startedAt < timeoutMs) {
    const now = performance.now();
    const root = rootRef.current;
    const count = root ? countElements(root) : 0;

    if (count !== lastCount) {
      lastCount = count;
      lastChangedAt = now;
      stableFrameCount = 0;
    } else {
      stableFrameCount += 1;
    }

    if (
      count >= minCount &&
      stableFrameCount >= stableFrames &&
      now - lastChangedAt >= stableMs
    ) {
      return true;
    }

    await waitForNextFrame();
  }

  return false;
}

export async function waitForNextFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export function ComparisonPanel({
  recordsRef,
  variants,
  onClear,
}: {
  recordsRef: React.RefObject<PerfRecord[]>;
  variants: [string, string];
  onClear: () => void;
}) {
  const [records, setRecords] = useState<PerfRecord[]>([]);

  useEffect(() => {
    const syncRecords = () => setRecords([...recordsRef.current]);
    syncRecords();
    const intervalId = window.setInterval(syncRecords, 500);
    return () => window.clearInterval(intervalId);
  }, [recordsRef]);

  const rows = getComparisonRows(records, variants);

  return (
    <div className="mb-3 rounded border bg-[var(--vscode-editor-background)] p-2 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong>Comparison</strong>
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() => {
            onClear();
            setRecords([]);
          }}
        >
          Clear
        </button>
      </div>
      <div className="grid gap-2">
        {rows.length === 0 ? (
          <div className="text-muted-foreground">
            Run Mount, Unmount, or Remount to compare variants.
          </div>
        ) : (
          rows.map((row) => (
            <ComparisonRow key={row.key} row={row} variants={variants} />
          ))
        )}
      </div>
    </div>
  );
}

export function MeasuredProfiler({
  id,
  record,
  children,
}: {
  id: string;
  record: (record: PerfRecord) => void;
  children: React.ReactNode;
}) {
  const onRender: ProfilerOnRenderCallback = (
    profilerId,
    phase,
    actualDuration,
    baseDuration,
  ) => {
    const isMount = phase === "mount";

    record({
      label: `${profilerId}:${phase}`,
      mountActualDuration: isMount ? actualDuration : undefined,
      updateActualDuration: phase === "update" ? actualDuration : undefined,
      baseDuration,
    });
  };

  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}

export function PerfPanel({
  recordsRef,
  onClear,
  onSampleFrames,
}: {
  recordsRef: React.RefObject<PerfRecord[]>;
  onClear: () => void;
  onSampleFrames?: () => void;
}) {
  const [records, setRecords] = useState<PerfRecord[]>([]);

  useEffect(() => {
    const syncRecords = () => setRecords([...recordsRef.current]);
    syncRecords();
    const intervalId = window.setInterval(syncRecords, 500);
    return () => window.clearInterval(intervalId);
  }, [recordsRef]);

  return (
    <div className="mb-3 rounded border bg-[var(--vscode-editor-background)] p-2 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong>Perf metrics</strong>
        <div className="flex gap-2">
          {onSampleFrames && (
            <button
              type="button"
              className="rounded border px-2 py-1"
              onClick={onSampleFrames}
            >
              Sample frames
            </button>
          )}
          <button
            type="button"
            className="rounded border px-2 py-1"
            onClick={() => {
              onClear();
              setRecords([]);
            }}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="max-h-64 overflow-auto">
        <table className="w-full table-fixed text-left">
          <thead className="sticky top-0 bg-[var(--vscode-editor-background)]">
            <tr>
              <th className="w-40 px-1">label</th>
              <th className="px-1">mount</th>
              <th className="px-1">update</th>
              <th className="px-1">action</th>
              <th className="px-1">expand</th>
              <th className="px-1">collapse</th>
              <th className="px-1">nodes</th>
              <th className="px-1">long</th>
              <th className="px-1">frame</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => (
              <tr key={`${record.label}-${index}`} className="border-t">
                <td className="truncate px-1">{record.label}</td>
                <td className="px-1">{formatMs(record.mountActualDuration)}</td>
                <td className="px-1">
                  {formatMs(record.updateActualDuration)}
                </td>
                <td className="px-1">{formatMs(record.actionMs)}</td>
                <td className="px-1">{formatMs(record.expandMs)}</td>
                <td className="px-1">{formatMs(record.collapseMs)}</td>
                <td className="px-1">
                  {record.nodeCountAfter === undefined
                    ? "-"
                    : `${record.nodeCountBefore ?? 0}->${record.nodeCountAfter}`}
                </td>
                <td className="px-1">
                  {record.longTaskCount === undefined
                    ? "-"
                    : `${record.longTaskCount}/${formatMs(record.longTaskMaxMs)}`}
                </td>
                <td className="px-1">
                  {record.worstFrameMs === undefined
                    ? "-"
                    : `${formatMs(record.worstFrameMs)} (${record.droppedFramesOver32ms ?? 0})`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function sampleFramesUntilSettled(
  settlePromise: Promise<unknown>,
  startedAt: number,
): Promise<FrameSample> {
  const frames: number[] = [];
  let last = startedAt;
  let settled = false;
  let settleError: unknown;

  const trackedSettlePromise = settlePromise.then(
    () => {
      settled = true;
    },
    (error) => {
      settleError = error;
      settled = true;
    },
  );

  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      frames.push(now - last);
      last = now;
      if (settled && frames.length >= 2) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });

  await trackedSettlePromise;

  if (settleError) {
    throw settleError;
  }

  return summarizeFrames(frames);
}

async function waitForFrameCount(count: number) {
  for (let i = 0; i < count; i++) {
    await waitForNextFrame();
  }
}

function sampleFrameGaps(durationMs: number) {
  return new Promise<FrameSample>((resolve) => {
    const frames: number[] = [];
    let last = performance.now();
    const end = last + durationMs;

    function tick(now: number) {
      frames.push(now - last);
      last = now;
      if (now < end) {
        requestAnimationFrame(tick);
        return;
      }

      resolve(summarizeFrames(frames));
    }

    requestAnimationFrame(tick);
  });
}

function summarizeFrames(frames: number[]): FrameSample {
  return {
    worstFrameMs: frames.length === 0 ? 0 : Math.max(...frames),
    droppedFramesOver32ms: frames.filter((x) => x > 32).length,
    droppedFramesOver50ms: frames.filter((x) => x > 50).length,
  };
}

function countElements(root: ParentNode): number {
  let count = 0;

  for (const element of root.querySelectorAll("*")) {
    count += 1;
    if (element.shadowRoot) {
      count += countElements(element.shadowRoot);
    }
  }

  return count;
}

function formatMs(value: number | undefined) {
  return value === undefined ? "-" : value.toFixed(1);
}

interface ComparisonRowData {
  key: string;
  label: string;
  left?: PerfRecord;
  right?: PerfRecord;
}

function getComparisonRows(
  records: PerfRecord[],
  variants: [string, string],
): ComparisonRowData[] {
  const rows = new Map<string, ComparisonRowData>();

  for (const record of records) {
    if (!record.comparisonKey || !record.variant) continue;
    const existing = rows.get(record.comparisonKey) ?? {
      key: record.comparisonKey,
      label: record.comparisonKey,
    };

    if (record.variant === variants[0] && !existing.left) {
      existing.left = record;
    }
    if (record.variant === variants[1] && !existing.right) {
      existing.right = record;
    }
    rows.set(record.comparisonKey, existing);
  }

  return Array.from(rows.values());
}

function ComparisonRow({
  row,
  variants,
}: {
  row: ComparisonRowData;
  variants: [string, string];
}) {
  const left = getPrimaryValue(row.left);
  const right = getPrimaryValue(row.right);
  const maxValue = Math.max(left ?? 0, right ?? 0, 1);
  const improvement = getLowerIsBetterDelta(left, right);

  return (
    <div className="rounded border p-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium">{row.label}</span>
        <span
          className={`rounded border px-2 py-0.5 font-medium ${getDeltaToneClassName(improvement.tone)}`}
        >
          {improvement.label}
        </span>
      </div>
      <VariantBar
        label={variants[0]}
        value={left}
        maxValue={maxValue}
        className="bg-muted-foreground/45"
      />
      <VariantBar
        label={variants[1]}
        value={right}
        maxValue={maxValue}
        className="bg-emerald-500/70"
      />
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <MetricComparison
          title="DOM nodes"
          leftLabel={variants[0]}
          leftValue={formatNodeValue(row.left)}
          leftMetric={row.left?.nodeCountAfter}
          rightLabel={variants[1]}
          rightValue={formatNodeValue(row.right)}
          rightMetric={row.right?.nodeCountAfter}
          delta={getLowerIsBetterDelta(
            row.left?.nodeCountAfter,
            row.right?.nodeCountAfter,
          )}
        />
        <MetricComparison
          title="Long tasks"
          leftLabel={variants[0]}
          leftValue={formatLongTaskValue(row.left)}
          leftMetric={row.left?.longTaskMaxMs}
          rightLabel={variants[1]}
          rightValue={formatLongTaskValue(row.right)}
          rightMetric={row.right?.longTaskMaxMs}
          delta={getLowerIsBetterDelta(
            row.left?.longTaskMaxMs,
            row.right?.longTaskMaxMs,
          )}
        />
        <MetricComparison
          title="Frame budget"
          leftLabel={variants[0]}
          leftValue={formatFrameValue(row.left)}
          leftMetric={row.left?.worstFrameMs}
          rightLabel={variants[1]}
          rightValue={formatFrameValue(row.right)}
          rightMetric={row.right?.worstFrameMs}
          delta={getLowerIsBetterDelta(
            row.left?.worstFrameMs,
            row.right?.worstFrameMs,
          )}
        />
      </div>
    </div>
  );
}

function VariantBar({
  label,
  value,
  maxValue,
  className,
}: {
  label: string;
  value: number | undefined;
  maxValue: number;
  className: string;
}) {
  const width = value === undefined ? 0 : Math.max((value / maxValue) * 100, 2);

  return (
    <div className="mb-1 grid grid-cols-[120px_1fr_56px] items-center gap-2">
      <span className="truncate text-muted-foreground">{label}</span>
      <div className="h-2 overflow-hidden rounded bg-muted">
        <div className={`h-full ${className}`} style={{ width: `${width}%` }} />
      </div>
      <span className="text-right">{formatMs(value)}</span>
    </div>
  );
}

function MetricComparison({
  title,
  leftLabel,
  leftValue,
  leftMetric,
  rightLabel,
  rightValue,
  rightMetric,
  delta,
}: {
  title: string;
  leftLabel: string;
  leftValue: string;
  leftMetric?: number;
  rightLabel: string;
  rightValue: string;
  rightMetric?: number;
  delta: MetricDelta;
}) {
  const maxMetric = Math.max(leftMetric ?? 0, rightMetric ?? 0, 1);

  return (
    <div className="border-t pt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{title}</span>
        <span
          className={`rounded border px-1.5 py-0.5 font-medium text-[11px] ${getDeltaToneClassName(delta.tone)}`}
        >
          {delta.label}
        </span>
      </div>
      <div className="grid gap-1">
        <MetricVariant
          title={title}
          label={leftLabel}
          value={leftValue}
          metric={leftMetric}
          maxMetric={maxMetric}
          className="bg-muted-foreground/45"
        />
        <MetricVariant
          title={title}
          label={rightLabel}
          value={rightValue}
          metric={rightMetric}
          maxMetric={maxMetric}
          className="bg-emerald-500/70"
        />
      </div>
    </div>
  );
}

function MetricVariant({
  title,
  label,
  value,
  metric,
  maxMetric,
  className,
}: {
  title: string;
  label: string;
  value: string;
  metric?: number;
  maxMetric: number;
  className: string;
}) {
  const width =
    metric === undefined || metric === 0
      ? 0
      : Math.max((metric / maxMetric) * 100, 2);

  return (
    <div className="rounded bg-muted/35 px-2 py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="min-w-0 truncate text-right font-medium tabular-nums">
          {value}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${label} ${title} comparison`}
        aria-valuemin={0}
        aria-valuemax={maxMetric}
        aria-valuenow={metric ?? 0}
        aria-valuetext={value}
        className="h-1.5 overflow-hidden rounded bg-muted"
      >
        <div className={`h-full ${className}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function getPrimaryValue(record: PerfRecord | undefined) {
  return (
    record?.actionMs ?? record?.mountActualDuration ?? record?.worstFrameMs
  );
}

function formatNodeValue(record: PerfRecord | undefined) {
  if (
    record?.nodeCountBefore === undefined ||
    record.nodeCountAfter === undefined
  ) {
    return "not sampled";
  }
  return `${record.nodeCountBefore}->${record.nodeCountAfter}`;
}

function formatLongTaskValue(record: PerfRecord | undefined) {
  if (
    record?.longTaskCount === undefined ||
    record.longTaskMaxMs === undefined ||
    record.longTaskTotalMs === undefined
  ) {
    return "not sampled";
  }
  return `max ${formatMs(record.longTaskMaxMs)} / total ${formatMs(record.longTaskTotalMs)} / count ${record.longTaskCount}`;
}

function formatFrameValue(record: PerfRecord | undefined) {
  if (record?.worstFrameMs === undefined) {
    return "not sampled";
  }
  return `worst ${formatMs(record.worstFrameMs)} / >32ms ${record.droppedFramesOver32ms ?? 0} / >50ms ${record.droppedFramesOver50ms ?? 0}`;
}

interface MetricDelta {
  label: string;
  tone: "good" | "bad" | "neutral" | "empty";
}

function getLowerIsBetterDelta(
  left: number | undefined,
  right: number | undefined,
): MetricDelta {
  if (left === undefined || right === undefined) {
    return { label: "not sampled", tone: "empty" };
  }
  if (left === right) {
    return { label: "same", tone: "neutral" };
  }
  if (left === 0) {
    return {
      label: right > 0 ? "higher" : "same",
      tone: right > 0 ? "bad" : "neutral",
    };
  }

  const improvement = ((left - right) / left) * 100;
  return {
    label:
      improvement >= 0
        ? `${improvement.toFixed(1)}% lower`
        : `${Math.abs(improvement).toFixed(1)}% higher`,
    tone: improvement >= 0 ? "good" : "bad",
  };
}

function getDeltaToneClassName(tone: MetricDelta["tone"]) {
  switch (tone) {
    case "good":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600";
    case "bad":
      return "border-red-500/30 bg-red-500/10 text-red-600";
    case "neutral":
      return "border-blue-500/25 bg-blue-500/10 text-blue-600";
    case "empty":
      return "border-muted bg-muted/30 text-muted-foreground";
  }
}
