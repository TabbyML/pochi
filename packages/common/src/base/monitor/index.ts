/**
 * Host-agnostic event extraction layer for the startMonitor tool.
 *
 * A MonitorWatcher taps the raw output chunks of a background job
 * (VSCode TerminalJob / CLI BackgroundJobManager), turns them into
 * line events, and batches them before delivery:
 *
 *   chunk -> strip ANSI -> partial-line buffer -> split lines
 *         -> batch (BatchIntervalMs) -> onEvents(lines)
 */

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
  lines: string[];
  /**
   * Present when the watch ended (job exit, timeout, kill). A batch with
   * `ended` may still carry final lines flushed from the buffer.
   */
  ended?: { reason: string };
}

/**
 * A MonitorEventBatch with a monotonically increasing sequence number,
 * used by the VSCode host <-> webview delivery channel so the webview can
 * acknowledge consumed batches across reloads.
 */
export interface MonitorEventEnvelope extends MonitorEventBatch {
  seq: number;
}

export interface MonitorWatcherOptions {
  /** Deliver a batch of event lines. Never called with an empty array. */
  onEvents: (lines: string[]) => void;
  /**
   * Called when `timeoutMs` elapses. The host is expected to kill the
   * underlying job, which in turn triggers `end()`.
   */
  onTimeout?: () => void;
  /**
   * Called once when the batch rate exceeds MonitorMaxBatchesPerMinute.
   * The host is expected to kill the underlying job; the watcher stops
   * ingesting further chunks on its own.
   */
  onRateLimitExceeded?: () => void;
  /** Watch deadline. `undefined` means no timeout (persistent monitor). */
  timeoutMs?: number;
  batchIntervalMs?: number;
}

// CSI sequences (colors, cursor movement) and OSC sequences (titles,
// hyperlinks) emitted by shells with terminal integration.
const AnsiEscapePattern =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape sequences requires control chars
  /\x1b\[[0-9;?]*[0-9A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

function stripAnsi(text: string): string {
  return text.replace(AnsiEscapePattern, "");
}

export class MonitorWatcher {
  private partialLine = "";
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

  /** Feed a raw output chunk. Chunks may split lines at any position. */
  ingest(chunk: string): void {
    if (this.ended || this.rateLimited) return;

    const text = this.partialLine + stripAnsi(chunk);
    // Lone \r is treated as a line break so progress-bar style rewrites
    // don't accumulate into one endless partial line.
    const segments = text.split(/\r\n|\n|\r/);
    this.partialLine = segments.pop() ?? "";

    for (const line of segments) {
      if (line.trim().length === 0) continue;
      if (this.pendingLines.length >= MonitorMaxLinesPerBatch) {
        this.droppedLines++;
        continue;
      }
      this.pendingLines.push(line);
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

    if (this.partialLine.trim().length > 0) {
      if (this.pendingLines.length < MonitorMaxLinesPerBatch) {
        this.pendingLines.push(this.partialLine);
      } else {
        this.droppedLines++;
      }
    }
    this.partialLine = "";
    this.flush();
    this.dispose();
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
        `[${this.droppedLines} more lines omitted; use readBackgroundJobOutput to read the full output]`,
      );
    }
    this.pendingLines = [];
    this.droppedLines = 0;
    this.options.onEvents(lines);
    this.checkRateLimit();
  }

  private checkRateLimit(): void {
    if (this.ended || this.rateLimited) return;
    const now = Date.now();
    this.flushTimestamps.push(now);
    this.flushTimestamps = this.flushTimestamps.filter((t) => t > now - 60_000);
    if (this.flushTimestamps.length > MonitorMaxBatchesPerMinute) {
      this.rateLimited = true;
      this.options.onRateLimitExceeded?.();
    }
  }
}

function renderMonitorEventBatch(batch: MonitorEventBatch): string {
  const header = `Monitor "${batch.description}" (backgroundJobId: ${batch.backgroundJobId}):`;
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
 * are kept on the LLM path but hidden from the chat UI.
 */
export function formatMonitorNotifications(
  batches: MonitorEventBatch[],
): string {
  const body = batches.map(renderMonitorEventBatch).join("\n\n");
  return prompts.createSystemReminder(
    `The following events were captured by background monitors started with startMonitor. This is an automated notification, not user input:\n${body}`,
  );
}
