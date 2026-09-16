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
 * A monitor delivering more batches than this within a rolling minute is
 * stopped automatically: each batch becomes a conversation message, so a
 * noisy monitor floods the context. The model is told to restart with a
 * stricter filter.
 */
export const MonitorMaxBatchesPerMinute = 10;

/** Ended reason used when a monitor is stopped for exceeding the rate limit. */
export const MonitorRateLimitedReason = `stopped automatically: more than ${MonitorMaxBatchesPerMinute} event batches per minute. Restart the monitor with a stricter output filter that emits only the lines you would act on.`;

/**
 * A single delivery of monitor events, ready to be injected into the
 * conversation between inference rounds.
 */
export interface MonitorEventBatch {
  backgroundJobId: string;
  description: string;
  outputFile?: string;
  lines: string[];
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
const MonitorMaxBatchCharacters = 8192;
const MonitorMaxTotalCharacters = 256 * 1024;

export interface MonitorWatcherOptions {
  /** Deliver a batch of event lines. Never called with an empty array. */
  onEvents: (lines: string[]) => void;
  /**
   * Called when `timeoutMs` elapses. The host is expected to kill the
   * underlying job, which in turn triggers `end()`.
   */
  onTimeout?: () => void;
  /**
   * Called once when the batch rate or total event volume exceeds its limit.
   * The host is expected to kill the underlying job; the watcher stops
   * ingesting further chunks on its own.
   */
  onRateLimitExceeded?: (reason: string) => void;
  /** Watch deadline. `undefined` means no timeout (persistent monitor). */
  timeoutMs?: number;
  batchIntervalMs?: number;
}

export class MonitorWatcher {
  private partialLine = "";
  private lineTruncated = false;
  private pendingCharacters = 0;
  private totalCharacters = 0;
  private pendingLines: string[] = [];
  private droppedLines = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  private ended = false;
  private rateLimited = false;
  private flushTimestamps: number[] = [];

  constructor(private readonly options: MonitorWatcherOptions) {
    if (options.timeoutMs !== undefined && options.onTimeout) {
      this.timeoutTimer = setTimeout(() => {
        this.options.onTimeout?.();
      }, options.timeoutMs);
    }
  }

  /** Feed a sanitized plain-text chunk. Chunks may split lines at any position. */
  ingest(chunk: string): void {
    if (this.ended || this.rateLimited) return;

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
    if (
      this.pendingLines.length >= MonitorMaxLinesPerBatch ||
      this.pendingCharacters + line.length > MonitorMaxBatchCharacters
    ) {
      this.droppedLines++;
      return;
    }
    this.pendingLines.push(line);
    this.pendingCharacters += line.length;
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
    if (this.droppedLines > 0) {
      lines.push(
        `[${this.droppedLines} more monitor events omitted; narrow the monitor command's output filter]`,
      );
    }
    this.pendingLines = [];
    this.pendingCharacters = 0;
    this.droppedLines = 0;
    this.totalCharacters += lines.reduce(
      (count, line) => count + line.length,
      0,
    );
    this.options.onEvents(lines);
    this.checkRateLimit();
  }

  private checkRateLimit(): void {
    if (this.ended || this.rateLimited) return;
    const now = Date.now();
    this.flushTimestamps.push(now);
    this.flushTimestamps = this.flushTimestamps.filter((t) => t > now - 60_000);
    const reason =
      this.totalCharacters >= MonitorMaxTotalCharacters
        ? "stopped automatically: total monitor event volume exceeded 256K characters. Read the output file and restart with a stricter filter."
        : this.flushTimestamps.length > MonitorMaxBatchesPerMinute
          ? MonitorRateLimitedReason
          : undefined;
    if (reason) {
      this.rateLimited = true;
      this.options.onRateLimitExceeded?.(reason);
    }
  }
}

function renderMonitorEventBatch(batch: MonitorEventBatch): string {
  const header = `Monitor "${batch.description}" (backgroundJobId: ${batch.backgroundJobId}${batch.outputFile ? `, outputFile: ${batch.outputFile}` : ""}):`;
  const lines = [...batch.lines];
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
