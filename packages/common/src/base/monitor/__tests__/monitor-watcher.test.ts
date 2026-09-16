import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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

  it.each([200, 10_000])("continues delivering beyond 256K characters with %ims between batches", (interval) => {
    const onEvents = vi.fn();
    const watcher = new MonitorWatcher({ onEvents });
    for (let i = 0; i < 200; i++) {
      watcher.ingest(`${"x".repeat(2000)}\n`);
      vi.advanceTimersByTime(interval);
    }
    expect(onEvents).toHaveBeenCalledTimes(200);
    watcher.end();
  });

  it("bounds a very long line and resumes with the next line", () => {
    const batches: string[][] = [];
    const watcher = new MonitorWatcher({
      onEvents: (lines) => batches.push(lines),
    });
    watcher.ingest("x".repeat(1024 * 1024));
    watcher.ingest("more of the same line\nnext\n");
    watcher.end();
    expect(batches.flat().join("\n").length).toBeLessThan(20_000);
    expect(batches.flat().at(-1)).toBe("next");
    expect(batches.flat()[0]).toContain("truncated");
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
    expect(delivered).toHaveLength(MonitorMaxLinesPerBatch);
    expect(delivered[0]).toBe("line 10");
    expect(delivered.at(-1)).toBe("line 59");
    expect(onEvents.mock.calls[0][1]).toBe(10);
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
        omittedLines: 12,
      },
    ]);

    expect(text.startsWith("<system-reminder>")).toBe(true);
    expect(text.endsWith("</system-reminder>")).toBe(true);
    expect(text).toContain("bgjob-1");
    expect(text).toContain('"errors in dev.log"');
    expect(text).toContain("ERROR boom");
    expect(text).toContain("12 monitor events omitted");
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
