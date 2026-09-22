import type { BackgroundJobNotification, BackgroundMonitorNotification } from "../message";
import { describe, expect, it } from "vitest";
import { type BackgroundJobNotificationQueueEntry, acknowledgeBackgroundJobNotification, enqueueBackgroundJobNotification, getPendingBackgroundJobNotifications } from "../background-job-notification-queue";

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

describe("background job notification queue", () => {
  it("shares storage across job kinds without buffering or consuming other jobs", () => {
    const command: BackgroundJobNotification = {
      kind: "command", notificationId: "command:terminal", backgroundJobId: "command",
      status: "completed", summary: "done", outputFile: "/tmp/command.log", finishedAt: 1,
    };
    const subagent: BackgroundJobNotification = {
      kind: "subagent", notificationId: "subagent:terminal", backgroundJobId: "subagent",
      status: "completed", result: "done", taskId: "child",
    };
    let queue: BackgroundJobNotificationQueueEntry[] = [];
    for (const item of [event(0), command, event(1), subagent, event(2)]) {
      queue = enqueueBackgroundJobNotification(queue, item);
    }
    expect(getPendingBackgroundJobNotifications(queue)).toEqual([event(0), command, subagent]);
    expect(enqueueBackgroundJobNotification(queue, command)).toEqual(queue);
    expect(acknowledgeBackgroundJobNotification(queue, "unknown")).toEqual(queue);
    expect(acknowledgeBackgroundJobNotification(queue, "watch:1")).toEqual(queue);
    queue = acknowledgeBackgroundJobNotification(queue, command.notificationId);
    expect(getPendingBackgroundJobNotifications(queue)).toEqual([event(0), subagent]);
    queue = acknowledgeBackgroundJobNotification(queue, "watch:0");
    expect(getPendingBackgroundJobNotifications(queue)).toEqual([
      { ...event(1), lines: ["line 1", "line 2"], omittedLines: 0 }, subagent,
    ]);
    queue = acknowledgeBackgroundJobNotification(queue, subagent.notificationId);
    expect(getPendingBackgroundJobNotifications(queue)).toHaveLength(1);
  });

  it("bounds prolonged unconsumed output and exposes only immutable notifications", () => {
    const head = event(0);
    let queue = enqueueBackgroundJobNotification([], head);
    const published = getPendingBackgroundJobNotifications(queue);
    for (let i = 1; i <= 10_000; i++) queue = enqueueBackgroundJobNotification(queue, event(i));
    expect(queue).toHaveLength(2);
    expect(getPendingBackgroundJobNotifications(queue)).toEqual(published);
    expect(published).toEqual([head]);
    expect((queue[1] as BackgroundMonitorNotification).lines).toHaveLength(50);
    expect((queue[1] as BackgroundMonitorNotification).lines[0]).toBe("line 9951");
    expect((queue[1] as BackgroundMonitorNotification).lines.at(-1)).toBe("line 10000");
    expect((queue[1] as BackgroundMonitorNotification).omittedLines).toBe(9950);
    expect(getPendingBackgroundJobNotifications(acknowledgeBackgroundJobNotification(queue, head.notificationId))[0]).toMatchObject({ notificationId: queue[1].notificationId, lines: (queue[1] as BackgroundMonitorNotification).lines });
  });

  it("enforces the character budget and carries upstream omission counts", () => {
    let queue = enqueueBackgroundJobNotification([], event(0));
    for (let i = 1; i <= 20; i++) {
      queue = enqueueBackgroundJobNotification(queue, { ...event(i), lines: ["x".repeat(2000)], omittedLines: 2 });
    }
    expect((queue[1] as BackgroundMonitorNotification).lines).toHaveLength(4);
    expect((queue[1] as BackgroundMonitorNotification).omittedLines).toBe(56);
  });

  it("seals final output and end status without modifying the published head", () => {
    let queue = enqueueBackgroundJobNotification([], event(0));
    queue = enqueueBackgroundJobNotification(queue, event(1));
    const ended = { reason: "done", status: "completed" as const, exitCode: 0 };
    queue = enqueueBackgroundJobNotification(queue, { ...event(2), lines: [], ended });
    expect(getPendingBackgroundJobNotifications(queue)).toEqual([
      event(0), { ...event(1), omittedLines: 0, ended },
    ]);
    expect(enqueueBackgroundJobNotification(queue, event(3))).toEqual(queue);
    // JSON persistence must preserve the sealed batch and its ID.
    expect(getPendingBackgroundJobNotifications(JSON.parse(JSON.stringify(queue)))).toEqual(queue);
  });

  it("isolates monitors and keeps buffered IDs stable until promotion", () => {
    let queue: BackgroundJobNotificationQueueEntry[] = [];
    for (let i = 0; i < 5; i++) {
      queue = enqueueBackgroundJobNotification(queue, event(i, "a"));
      queue = enqueueBackgroundJobNotification(queue, event(i, "b"));
    }
    expect(getPendingBackgroundJobNotifications(queue).map((item) => item.notificationId)).toEqual(["a:0", "b:0"]);
    queue = acknowledgeBackgroundJobNotification(queue, "a:0");
    const promoted = getPendingBackgroundJobNotifications(queue).find((item) => item.backgroundJobId === "a");
    expect(promoted?.notificationId).toBe("a:1");
    expect((promoted as BackgroundMonitorNotification | undefined)?.lines).toEqual(["line 1", "line 2", "line 3", "line 4"]);
    queue = enqueueBackgroundJobNotification(queue, event(5, "a"));
    expect(getPendingBackgroundJobNotifications(queue)).toContain(promoted);
  });
});
