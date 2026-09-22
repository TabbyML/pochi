import type { BackgroundMonitorNotification } from "../../message";
import { describe, expect, it } from "vitest";
import { type MonitorEventQueueEntry, acknowledgeMonitorEvent, enqueueMonitorEvent, getPendingMonitorEvents } from "..";

function event(id: number, job = "watch"): BackgroundMonitorNotification {
  return { kind: "monitor" as const,
    notificationId: `${job}:${id}`,
    backgroundJobId: job,
    description: job,
    command: "watch",
    outputFile: "/tmp/watch.log",
    lines: [`line ${id}`],
  };
}

describe("monitor source queue", () => {
  it("normalizes persisted batches without a kind and preserves buffered IDs on acknowledgement", () => {
    const { kind: _headKind, ...head } = event(0);
    const { kind: _bufferKind, ...buffered } = event(1);
    const persisted: MonitorEventQueueEntry[] = JSON.parse(JSON.stringify([
      head, { ...buffered, buffered: true },
    ]));
    expect(getPendingMonitorEvents(persisted)).toEqual([event(0)]);
    const promoted = acknowledgeMonitorEvent(persisted, head.notificationId);
    expect(getPendingMonitorEvents(promoted)).toEqual([event(1)]);
    expect(getPendingMonitorEvents(acknowledgeMonitorEvent(promoted, buffered.notificationId))).toEqual([]);
  });

  it("keeps already published legacy IDs and contents intact across an upgrade", () => {
    const legacy = [event(0), event(1), event(2)];
    let queue = enqueueMonitorEvent(legacy, event(3));
    queue = enqueueMonitorEvent(queue, event(4));
    expect(getPendingMonitorEvents(queue)).toEqual(legacy);
    for (const published of legacy) queue = acknowledgeMonitorEvent(queue, published.notificationId);
    expect(getPendingMonitorEvents(queue)).toEqual([
      { ...event(3), lines: ["line 3", "line 4"], omittedLines: 0 },
    ]);
  });

  it("bounds prolonged unconsumed output and exposes only immutable notifications", () => {
    const head = event(0);
    let queue = enqueueMonitorEvent([], head);
    const published = getPendingMonitorEvents(queue);
    for (let i = 1; i <= 10_000; i++) queue = enqueueMonitorEvent(queue, event(i));
    expect(queue).toHaveLength(2);
    expect(getPendingMonitorEvents(queue)).toEqual(published);
    expect(published).toEqual([head]);
    expect(queue[1].lines).toHaveLength(50);
    expect(queue[1].lines[0]).toBe("line 9951");
    expect(queue[1].lines.at(-1)).toBe("line 10000");
    expect(queue[1].omittedLines).toBe(9950);
    expect(getPendingMonitorEvents(acknowledgeMonitorEvent(queue, head.notificationId))[0]).toMatchObject({ notificationId: queue[1].notificationId, lines: queue[1].lines });
  });

  it("enforces the character budget and carries upstream omission counts", () => {
    let queue = enqueueMonitorEvent([], event(0));
    for (let i = 1; i <= 20; i++) {
      queue = enqueueMonitorEvent(queue, { ...event(i), lines: ["x".repeat(2000)], omittedLines: 2 });
    }
    expect(queue[1].lines).toHaveLength(4);
    expect(queue[1].omittedLines).toBe(56);
  });

  it("seals final output and end status without modifying the published head", () => {
    let queue = enqueueMonitorEvent([], event(0));
    queue = enqueueMonitorEvent(queue, event(1));
    const ended = { reason: "done", status: "completed" as const, exitCode: 0 };
    queue = enqueueMonitorEvent(queue, { ...event(2), lines: [], ended });
    expect(getPendingMonitorEvents(queue)).toEqual([
      event(0), { ...event(1), omittedLines: 0, ended },
    ]);
    expect(enqueueMonitorEvent(queue, event(3))).toEqual(queue);
    // JSON persistence must preserve the sealed batch and its ID.
    expect(getPendingMonitorEvents(JSON.parse(JSON.stringify(queue)))).toEqual(queue);
  });

  it("isolates monitors and keeps buffered IDs stable until promotion", () => {
    let queue: MonitorEventQueueEntry[] = [];
    for (let i = 0; i < 5; i++) {
      queue = enqueueMonitorEvent(queue, event(i, "a"));
      queue = enqueueMonitorEvent(queue, event(i, "b"));
    }
    expect(getPendingMonitorEvents(queue).map((item) => item.notificationId)).toEqual(["a:0", "b:0"]);
    queue = acknowledgeMonitorEvent(queue, "a:0");
    const promoted = getPendingMonitorEvents(queue).find((item) => item.backgroundJobId === "a");
    expect(promoted?.notificationId).toBe("a:1");
    expect(promoted?.lines).toEqual(["line 1", "line 2", "line 3", "line 4"]);
    queue = enqueueMonitorEvent(queue, event(5, "a"));
    expect(getPendingMonitorEvents(queue)).toContain(promoted);
  });
});
