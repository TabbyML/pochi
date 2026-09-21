import type { MonitorEventEnvelope } from "@getpochi/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorDelivery } from "./monitor-delivery";

const event = (id: string, lines = ["ready"]): MonitorEventEnvelope => ({
  notificationId: `${id}:event`,
  backgroundJobId: id,
  description: id,
  command: "watch",
  outputFile: "/tmp/watch.log",
  lines,
});

describe("monitor delivery budget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it("allows the next batch at the next sending opportunity without a cooldown", () => {
    const delivery = new MonitorDelivery();
    expect(delivery.take([event("a")])).toEqual([event("a")]);
    expect(delivery.take([event("b")])).toEqual([event("b")]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("limits each delivery to 32K characters and serves waiting monitors first", () => {
    const delivery = new MonitorDelivery();
    const events = Array.from({ length: 6 }, (_, i) =>
      event(String(i), ["x".repeat(8192)]),
    );
    expect(delivery.take(events).map((item) => item.backgroundJobId)).toEqual([
      "0",
      "1",
      "2",
      "3",
    ]);
    expect(delivery.take(events).map((item) => item.backgroundJobId)).toEqual([
      "4",
      "5",
      "0",
      "1",
    ]);
  });

  it("does not hold ordinary job outcomes or let a terminal batch overtake its head", () => {
    const delivery = new MonitorDelivery();
    const command = {
      kind: "command" as const,
      notificationId: "cmd",
      backgroundJobId: "cmd",
      status: "completed" as const,
      outputFile: "/tmp/cmd.log",
      finishedAt: 0,
      summary: "done",
    };
    const large = (id: string) => event(id, ["x".repeat(8192)]);
    const terminal = {
      ...event("waiting", []),
      notificationId: "end",
      ended: { reason: "done" },
    };
    const events = [
      large("a"),
      large("b"),
      large("c"),
      large("d"),
      large("waiting"),
      terminal,
    ];
    expect(delivery.take(events)).not.toContain(terminal);
    expect(delivery.take([event("other"), command])).toEqual([
      command,
      event("other"),
    ]);
    expect(delivery.take([large("waiting"), terminal])).toEqual([
      large("waiting"),
      terminal,
    ]);
  });

  it("shares the request budget with notifications already attached to the message", () => {
    const delivery = new MonitorDelivery();
    const head = event("finished");
    const end = {
      ...event("finished", []),
      notificationId: "end",
      ended: { reason: "done" },
    };
    expect(delivery.take([head, end], 0)).toEqual([]);
    expect(delivery.take([head, end], head.lines[0].length)).toEqual([
      head,
      end,
    ]);
  });

  it("retains the delivery budget when flushing ended monitors", () => {
    const delivery = new MonitorDelivery();
    delivery.take([event("previous")]);
    const ended = Array.from({ length: 6 }, (_, i) => ({
      ...event(String(i), ["x".repeat(8192)]),
      ended: { reason: "done" },
    }));
    expect(delivery.take(ended).map((notice) => notice.notificationId)).toEqual(
      ended.slice(0, 4).map((notice) => notice.notificationId),
    );
    expect(
      delivery.take(ended.slice(4)).map((notice) => notice.notificationId),
    ).toEqual(ended.slice(4).map((notice) => notice.notificationId));
  });
});
