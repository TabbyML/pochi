import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MonitorMaxBatchesPerMinute,
  MonitorMaxLinesPerBatch,
  MonitorWatcher,
  formatMonitorNotifications,
} from "..";

describe("MonitorWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("batches lines arriving within the batch interval", () => {
    const onEvents = vi.fn();
    const watcher = new MonitorWatcher({ onEvents });

    watcher.ingest("line 1\nline 2\n");
    watcher.ingest("line 3\n");
    expect(onEvents).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onEvents).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenCalledWith(["line 1", "line 2", "line 3"]);
  });

  it("delivers separate batches for lines beyond the interval", () => {
    const onEvents = vi.fn();
    const watcher = new MonitorWatcher({ onEvents });

    watcher.ingest("first\n");
    vi.advanceTimersByTime(200);
    watcher.ingest("second\n");
    vi.advanceTimersByTime(200);

    expect(onEvents).toHaveBeenNthCalledWith(1, ["first"]);
    expect(onEvents).toHaveBeenNthCalledWith(2, ["second"]);
  });

  it("buffers partial lines across chunks", () => {
    const onEvents = vi.fn();
    const watcher = new MonitorWatcher({ onEvents });

    watcher.ingest("hel");
    watcher.ingest("lo\n");
    vi.advanceTimersByTime(200);

    expect(onEvents).toHaveBeenCalledWith(["hello"]);
  });

  it("strips ANSI escape sequences", () => {
    const onEvents = vi.fn();
    const watcher = new MonitorWatcher({ onEvents });

    watcher.ingest("\x1b[31mERROR\x1b[0m something\n");
    watcher.ingest("\x1b]633;C\x07visible\n");
    vi.advanceTimersByTime(200);

    expect(onEvents).toHaveBeenCalledWith(["ERROR something", "visible"]);
  });

  it("skips blank lines", () => {
    const onEvents = vi.fn();
    const watcher = new MonitorWatcher({ onEvents });

    watcher.ingest("\n\n  \na\n\n");
    vi.advanceTimersByTime(200);

    expect(onEvents).toHaveBeenCalledWith(["a"]);
  });

  it("treats lone carriage returns as line breaks", () => {
    const onEvents = vi.fn();
    const watcher = new MonitorWatcher({ onEvents });

    watcher.ingest("progress 10%\rprogress 20%\n");
    vi.advanceTimersByTime(200);

    expect(onEvents).toHaveBeenCalledWith(["progress 10%", "progress 20%"]);
  });

  it("caps lines per batch and reports the omission", () => {
    const onEvents = vi.fn();
    const watcher = new MonitorWatcher({ onEvents });

    const lines = Array.from(
      { length: MonitorMaxLinesPerBatch + 10 },
      (_, i) => `line ${i}`,
    );
    watcher.ingest(`${lines.join("\n")}\n`);
    vi.advanceTimersByTime(200);

    const delivered = onEvents.mock.calls[0][0] as string[];
    expect(delivered).toHaveLength(MonitorMaxLinesPerBatch + 1);
    expect(delivered.at(-1)).toContain("10 more monitor events omitted");
    expect(delivered.at(-1)).toContain("narrow the monitor command's output filter");
  });

  it("flushes buffered content synchronously on end", () => {
    const onEvents = vi.fn();
    const watcher = new MonitorWatcher({ onEvents });

    watcher.ingest("complete line\nno trailing newline");
    watcher.end();

    expect(onEvents).toHaveBeenCalledWith([
      "complete line",
      "no trailing newline",
    ]);

    // No duplicate flush from the pending timer, no ingestion after end.
    watcher.ingest("late\n");
    vi.advanceTimersByTime(200);
    expect(onEvents).toHaveBeenCalledTimes(1);
  });

  it("fires onTimeout after the deadline", () => {
    const onEvents = vi.fn();
    const onTimeout = vi.fn();
    new MonitorWatcher({ onEvents, onTimeout, timeoutMs: 1000 });

    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("stops ingesting and fires onRateLimitExceeded when batches flood", () => {
    const onEvents = vi.fn();
    const onRateLimitExceeded = vi.fn();
    const watcher = new MonitorWatcher({ onEvents, onRateLimitExceeded });

    // One batch every 2 seconds: exceeds the per-minute cap on batch N+1.
    for (let i = 0; i <= MonitorMaxBatchesPerMinute; i++) {
      watcher.ingest(`line ${i}\n`);
      vi.advanceTimersByTime(2000);
    }

    expect(onRateLimitExceeded).toHaveBeenCalledTimes(1);
    expect(onEvents).toHaveBeenCalledTimes(MonitorMaxBatchesPerMinute + 1);

    // Rate-limited: further chunks are ignored.
    watcher.ingest("late\n");
    vi.advanceTimersByTime(2000);
    expect(onEvents).toHaveBeenCalledTimes(MonitorMaxBatchesPerMinute + 1);
  });

  it("does not rate limit slow event streams", () => {
    const onEvents = vi.fn();
    const onRateLimitExceeded = vi.fn();
    const watcher = new MonitorWatcher({ onEvents, onRateLimitExceeded });

    // One batch every 10 seconds stays under the cap indefinitely.
    for (let i = 0; i < MonitorMaxBatchesPerMinute * 3; i++) {
      watcher.ingest(`line ${i}\n`);
      vi.advanceTimersByTime(10_000);
    }

    expect(onRateLimitExceeded).not.toHaveBeenCalled();
    expect(onEvents).toHaveBeenCalledTimes(MonitorMaxBatchesPerMinute * 3);
  });

  it("does not set a timeout when timeoutMs is undefined", () => {
    const onEvents = vi.fn();
    const onTimeout = vi.fn();
    new MonitorWatcher({ onEvents, onTimeout });

    vi.advanceTimersByTime(3_600_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

describe("formatMonitorNotifications", () => {
  it("wraps batches in a system reminder", () => {
    const text = formatMonitorNotifications([
      {
        backgroundJobId: "bgjob-1",
        description: "errors in dev.log",
        lines: ["ERROR boom"],
      },
    ]);

    expect(text.startsWith("<system-reminder>")).toBe(true);
    expect(text.endsWith("</system-reminder>")).toBe(true);
    expect(text).toContain("bgjob-1");
    expect(text).toContain('"errors in dev.log"');
    expect(text).toContain("ERROR boom");
    expect(text).toContain("not user input");
  });

  it("merges multiple batches into one reminder", () => {
    const text = formatMonitorNotifications([
      { backgroundJobId: "bgjob-1", description: "a", lines: ["x"] },
      {
        backgroundJobId: "bgjob-2",
        description: "b",
        lines: [],
        ended: { reason: "exited with code 0" },
      },
    ]);

    expect(text.match(/<system-reminder>/g)).toHaveLength(1);
    expect(text).toContain("bgjob-1");
    expect(text).toContain("[monitor ended: exited with code 0]");
  });
});
