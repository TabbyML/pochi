import {
  Profiler,
  type ProfilerOnRenderCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export interface PerfRecord {
  label: string;
  dedupeKey?: string;
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
    },
  ) => Promise<void>;
  sampleFrames: (label: string, durationMs?: number) => Promise<void>;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

export function usePerfHarness(): PerfHarnessValue {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const recordsRef = useRef<PerfRecord[]>([]);
  const longTasks = useRef<LongTaskEntry[]>([]);
  const dedupedRecords = useRef<Set<string>>(new Set());

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
    if (record.dedupeKey) {
      if (dedupedRecords.current.has(record.dedupeKey)) {
        return;
      }
      dedupedRecords.current.add(record.dedupeKey);
    }

    recordsRef.current = [record, ...recordsRef.current].slice(0, 30);
  };

  const clear = () => {
    longTasks.current = [];
    dedupedRecords.current = new Set();
    recordsRef.current = [];
  };

  const measureAction: PerfHarnessValue["measureAction"] = async (
    label,
    action,
    options,
  ) => {
    const root = options?.target ?? rootRef.current ?? document.body;
    const startedAt = performance.now();
    const nodeCountBefore = root.querySelectorAll("*").length;
    const longTaskStartIndex = longTasks.current.length;

    action();
    await afterTwoFrames();

    const elapsed = performance.now() - startedAt;
    const nodeCountAfter = root.querySelectorAll("*").length;
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
  variant,
  comparisonKey,
  children,
}: {
  id: string;
  record: (record: PerfRecord) => void;
  variant?: string;
  comparisonKey?: string;
  children: React.ReactNode;
}) {
  const onRender: ProfilerOnRenderCallback = (
    profilerId,
    phase,
    actualDuration,
    baseDuration,
  ) => {
    const isMount = phase === "mount";
    const mountComparisonKey =
      isMount && comparisonKey && variant
        ? `${comparisonKey}:${variant}`
        : undefined;

    record({
      label: `${profilerId}:${phase}`,
      dedupeKey: mountComparisonKey,
      variant: isMount ? variant : undefined,
      comparisonKey: isMount ? comparisonKey : undefined,
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

async function afterTwoFrames() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function sampleFrameGaps(durationMs: number) {
  return new Promise<{
    worstFrameMs: number;
    droppedFramesOver32ms: number;
    droppedFramesOver50ms: number;
  }>((resolve) => {
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

      resolve({
        worstFrameMs: Math.max(...frames),
        droppedFramesOver32ms: frames.filter((x) => x > 32).length,
        droppedFramesOver50ms: frames.filter((x) => x > 50).length,
      });
    }

    requestAnimationFrame(tick);
  });
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
  const improvement =
    left === undefined || right === undefined || left === 0
      ? undefined
      : ((left - right) / left) * 100;

  return (
    <div className="rounded border p-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium">{row.label}</span>
        <span className="text-muted-foreground">
          {improvement === undefined
            ? "-"
            : `${improvement >= 0 ? "+" : ""}${improvement.toFixed(1)}%`}
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
      <div className="mt-2 grid grid-cols-3 gap-2 text-muted-foreground">
        <Metric label="nodes" value={formatNodeDelta(row.left, row.right)} />
        <Metric label="long" value={formatLongTaskDelta(row.left, row.right)} />
        <Metric label="frame" value={formatFrameDelta(row.left, row.right)} />
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-muted/40 px-2 py-1">
      {label}: {value}
    </div>
  );
}

function getPrimaryValue(record: PerfRecord | undefined) {
  return (
    record?.actionMs ?? record?.mountActualDuration ?? record?.worstFrameMs
  );
}

function formatNodeDelta(
  left: PerfRecord | undefined,
  right: PerfRecord | undefined,
) {
  const leftNodes = getNodeDelta(left);
  const rightNodes = getNodeDelta(right);
  if (leftNodes === undefined || rightNodes === undefined) return "-";
  return `${leftNodes}->${rightNodes}`;
}

function getNodeDelta(record: PerfRecord | undefined) {
  if (
    record?.nodeCountBefore === undefined ||
    record.nodeCountAfter === undefined
  ) {
    return undefined;
  }
  return record.nodeCountAfter - record.nodeCountBefore;
}

function formatLongTaskDelta(
  left: PerfRecord | undefined,
  right: PerfRecord | undefined,
) {
  if (left?.longTaskMaxMs === undefined || right?.longTaskMaxMs === undefined) {
    return "-";
  }
  return `${formatMs(left.longTaskMaxMs)}->${formatMs(right.longTaskMaxMs)}`;
}

function formatFrameDelta(
  left: PerfRecord | undefined,
  right: PerfRecord | undefined,
) {
  if (left?.worstFrameMs === undefined || right?.worstFrameMs === undefined) {
    return "-";
  }
  return `${formatMs(left.worstFrameMs)}->${formatMs(right.worstFrameMs)}`;
}
