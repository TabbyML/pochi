/**
 * Host-agnostic event extraction layer for the startMonitor tool.
 *
 * A MonitorWatcher receives background job output already cleaned by the
 * host's PlainOutputSanitizer, turns it into line events, and batches them
 * before delivery:
 *
 *   plain-text chunk -> partial-line buffer -> split lines
 *         -> batch (BatchIntervalMs) -> onEvents(lines)
 */

/** Lines arriving within this window are delivered as one batch. */
export const MonitorBatchIntervalMs = 200;

/** Default watch deadline when `persistent` is not set. */
export const MonitorDefaultTimeoutMs = 300_000;

/** Hard cap of lines per delivered batch; the rest is summarized. */
export const MonitorMaxLinesPerBatch = 50;

export interface MonitorJobOptions {
  description: string;
  timeoutMs?: number;
}

const MonitorMaxLineCharacters = 2048;
export const MonitorMaxBatchCharacters = 8192;

export interface MonitorWatcherOptions {
  /** Deliver a batch of event lines. Never called with an empty array. */
  onEvents: (lines: string[], omittedLines?: number) => void;
  /**
   * Called when `timeoutMs` elapses. The host is expected to kill the
   * underlying job, which in turn triggers `end()`.
   */
  onTimeout?: () => void;
  /** Watch deadline. `undefined` means no timeout (persistent monitor). */
  timeoutMs?: number;
  batchIntervalMs?: number;
}

export class MonitorWatcher {
  private partialLine = "";
  private lineTruncated = false;
  private pendingCharacters = 0;
  private pendingLines: string[] = [];
  private droppedLines = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  private ended = false;

  constructor(private readonly options: MonitorWatcherOptions) {
    if (options.timeoutMs !== undefined && options.onTimeout) {
      this.timeoutTimer = setTimeout(() => {
        this.options.onTimeout?.();
      }, options.timeoutMs);
    }
  }

  /** Feed a sanitized plain-text chunk. Chunks may split lines at any position. */
  ingest(chunk: string): void {
    if (this.ended) return;

    const segments = chunk.split(/\r\n|\n|\r/);
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const remaining = Math.max(
        0,
        MonitorMaxLineCharacters - this.partialLine.length,
      );
      this.partialLine += segment.slice(0, remaining);
      if (segment.length > remaining) this.lineTruncated = true;
      if (i < segments.length - 1) this.finishLine();
    }

    if (this.pendingLines.length > 0 && this.flushTimer === undefined) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        this.flush();
      }, this.options.batchIntervalMs ?? MonitorBatchIntervalMs);
    }
  }

  /**
   * The watch ended (job exit, kill, or timeout enforcement). Flushes any
   * buffered lines synchronously. Idempotent.
   */
  end(): void {
    if (this.ended) return;
    this.ended = true;

    this.finishLine();
    this.flush();
    this.dispose();
  }

  private finishLine(): void {
    const line =
      this.partialLine +
      (this.lineTruncated ? " [line truncated; read the output file]" : "");
    this.partialLine = "";
    this.lineTruncated = false;
    if (!line.trim()) return;
    this.pendingLines.push(line);
    this.pendingCharacters += line.length;
    while (
      this.pendingLines.length > MonitorMaxLinesPerBatch ||
      this.pendingCharacters > MonitorMaxBatchCharacters
    ) {
      this.pendingCharacters -= this.pendingLines.shift()?.length ?? 0;
      this.droppedLines++;
    }
  }

  dispose(): void {
    if (this.flushTimer !== undefined) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.timeoutTimer !== undefined) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = undefined;
    }
  }

  private flush(): void {
    if (this.pendingLines.length === 0) return;
    const lines = this.pendingLines;
    const omittedLines = this.droppedLines;
    this.pendingLines = [];
    this.pendingCharacters = 0;
    this.droppedLines = 0;
    if (omittedLines) this.options.onEvents(lines, omittedLines);
    else this.options.onEvents(lines);
  }
}

export {
  type MonitorEventQueueEntry,
  acknowledgeMonitorEvent,
  enqueueMonitorEvent,
  getPendingMonitorEvents,
} from "./queue";
