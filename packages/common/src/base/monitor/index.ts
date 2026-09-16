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

import type { BackgroundJobNotification } from "../message";
import { prompts } from "../prompts";

/** Lines arriving within this window are delivered as one batch. */
export const MonitorBatchIntervalMs = 200;

/** Default watch deadline when `persistent` is not set. */
export const MonitorDefaultTimeoutMs = 300_000;

/** Hard cap of lines per delivered batch; the rest is summarized. */
export const MonitorMaxLinesPerBatch = 50;

/**
 * A single delivery of monitor events, ready to be injected into the
 * conversation between inference rounds.
 */
export interface MonitorEventBatch {
  backgroundJobId: string;
  description: string;
  outputFile?: string;
  lines: string[];
  /** Older lines omitted from the notification; full output remains in the log. */
  omittedLines?: number;
  /**
   * Present when the watch ended (job exit, timeout, kill). A batch with
   * `ended` may still carry final lines flushed from the buffer.
   */
  ended?: {
    reason: string;
    status?: "completed" | "failed" | "stopped";
    exitCode?: number;
  };
}

/** Stable identities are retained until the event reaches the conversation. */
export interface MonitorEventEnvelope extends MonitorEventBatch {
  notificationId: string;
  command: string;
  outputFile: string;
}

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

function renderMonitorEventBatch(batch: MonitorEventBatch): string {
  const header = `Monitor "${batch.description}" (backgroundJobId: ${batch.backgroundJobId}${batch.outputFile ? `, outputFile: ${batch.outputFile}` : ""}):`;
  const lines = [...batch.lines];
  if (batch.omittedLines) {
    lines.unshift(
      `[${batch.omittedLines} monitor events omitted; read the output file for full output]`,
    );
  }
  if (batch.ended) {
    lines.push(`[monitor ended: ${batch.ended.reason}]`);
  }
  return `${header}\n${lines.join("\n")}`;
}

/**
 * Renders one delivery of monitor event batches as the system-reminder user
 * message injected into the conversation. Shared by the CLI task runner and
 * the VSCode webview so both hosts speak the same protocol. System reminders
 * are rendered as monitor event cards in the chat UI.
 */
export function formatMonitorNotifications(
  batches: MonitorEventBatch[],
): string {
  const body = batches.map(renderMonitorEventBatch).join("\n\n");
  return prompts.createSystemReminder(
    `The following events were captured by background monitors started with startMonitor. This is an automated notification, not user input:\n${body}`,
  );
}

export type BackgroundJobEvent =
  | BackgroundJobNotification
  | MonitorEventEnvelope;

export {
  type MonitorEventQueueEntry,
  acknowledgeMonitorEvent,
  enqueueMonitorEvent,
  getPendingMonitorEvents,
} from "./queue";
