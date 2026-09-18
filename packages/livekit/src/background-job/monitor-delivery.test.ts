import type { MonitorEventEnvelope } from "@getpochi/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorDelivery, MonitorDeliveryIntervalMs } from "./monitor-delivery";

const event = (id: string, lines = ["ready"]): MonitorEventEnvelope => ({
  notificationId: `${id}:event`, backgroundJobId: id, description: id,
  command: "watch", outputFile: "/tmp/watch.log", lines,
});

describe("monitor delivery budget", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => vi.useRealTimers());

  it("shares a cooldown across monitors and wakes without another output event", () => {
    const onReady = vi.fn();
    const delivery = new MonitorDelivery(onReady);
    expect(delivery.take([event("a")])).toHaveLength(1);
    const next = event("b");
    expect(delivery.take([next])).toEqual([]);
    vi.advanceTimersByTime(MonitorDeliveryIntervalMs - 1);
    expect(onReady).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onReady).toHaveBeenCalledOnce();
    expect(delivery.take([next])).toEqual([next]);
    delivery.dispose();
    vi.advanceTimersByTime(MonitorDeliveryIntervalMs);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("limits each delivery to 32K characters and serves waiting monitors first", () => {
    const delivery = new MonitorDelivery(vi.fn());
    const events = Array.from({ length: 6 }, (_, i) => event(String(i), ["x".repeat(8192)]));
    expect(delivery.take(events).map((item) => item.backgroundJobId)).toEqual(["0", "1", "2", "3"]);
    vi.advanceTimersByTime(MonitorDeliveryIntervalMs);
    expect(delivery.take(events).map((item) => item.backgroundJobId)).toEqual(["4", "5", "0", "1"]);
    delivery.dispose();
  });

  it("does not hold ordinary job outcomes or let a terminal batch overtake its head", () => {
    const delivery = new MonitorDelivery(vi.fn());
    const command = { kind: "command" as const, notificationId: "cmd", backgroundJobId: "cmd", status: "completed" as const, outputFile: "/tmp/cmd.log", finishedAt: 0, summary: "done" };
    const large = (id: string) => event(id, ["x".repeat(8192)]);
    const terminal = { ...event("waiting", []), notificationId: "end", ended: { reason: "done" } };
    const events = [large("a"), large("b"), large("c"), large("d"), large("waiting"), terminal];
    expect(delivery.take(events)).not.toContain(terminal);
    expect(delivery.take([event("other"), command])).toEqual([command]);
    vi.advanceTimersByTime(MonitorDeliveryIntervalMs);
    expect(delivery.take([large("waiting"), terminal])).toEqual([large("waiting"), terminal]);
    delivery.dispose();
  });

  it("flushes only ended monitors during cooldown and preserves their head ordering", () => {
    const delivery = new MonitorDelivery(vi.fn());
    delivery.take([event("previous")]);
    const head = event("finished");
    const end = {
      ...event("finished", []),
      notificationId: "end",
      ended: { reason: "done" },
    };
    const running = event("running");
    expect(delivery.take([head, end, running])).toEqual([]);
    expect(
      delivery.take([head, end, running], { allowEndedDuringCooldown: true }),
    ).toEqual([head, end]);
    expect(
      delivery.take([running], { allowEndedDuringCooldown: true }),
    ).toEqual([]);
    delivery.dispose();
  });

  it("retains the delivery budget when flushing ended monitors", () => {
    const delivery = new MonitorDelivery(vi.fn());
    delivery.take([event("previous")]);
    const ended = Array.from({ length: 6 }, (_, i) => ({
      ...event(String(i), ["x".repeat(8192)]),
      ended: { reason: "done" },
    }));
    expect(
      delivery
        .take(ended, { allowEndedDuringCooldown: true })
        .map((notice) => notice.notificationId),
    ).toEqual(ended.slice(0, 4).map((notice) => notice.notificationId));
    expect(
      delivery
        .take(ended.slice(4), { allowEndedDuringCooldown: true })
        .map((notice) => notice.notificationId),
    ).toEqual(ended.slice(4).map((notice) => notice.notificationId));
    delivery.dispose();
  });
});
