import type {
  BackgroundJobEvent,
  MonitorEventEnvelope,
} from "@getpochi/common";

export const MonitorDeliveryIntervalMs = 6_000;
export const MonitorMaxDeliveryCharacters = 32 * 1024;

export type MonitorDeliveryOptions = {
  /** Allow ended monitor groups through the cooldown, preserving order and budget. */
  allowEndedDuringCooldown?: boolean;
};

/** One scheduler per task, shared by all its monitors and chat instances. */
export class MonitorDelivery {
  private nextDeliveryAt = 0;
  private order = 0;
  private readonly lastServed = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly onReady: () => void) {}

  ready(
    notifications: readonly BackgroundJobEvent[],
    options?: MonitorDeliveryOptions,
  ): BackgroundJobEvent[] {
    const regular = notifications.filter((notice) => !("lines" in notice));
    const coolingDown = Date.now() < this.nextDeliveryAt;
    if (coolingDown && !options?.allowEndedDuringCooldown) return regular;

    const groups = new Map<string, MonitorEventEnvelope[]>();
    for (const notice of notifications) {
      if (!("lines" in notice)) continue;
      const group = groups.get(notice.backgroundJobId) ?? [];
      group.push(notice);
      groups.set(notice.backgroundJobId, group);
    }
    // CLI shutdown may flush ended monitors without waiting for the cooldown.
    // Keep their heads ahead of their endings and retain the delivery budget.
    const ordered = [...groups]
      .filter(
        ([, group]) => !coolingDown || group.some((notice) => notice.ended),
      )
      .sort(
        ([a], [b]) =>
          (this.lastServed.get(a) ?? 0) - (this.lastServed.get(b) ?? 0),
      );
    let remaining = MonitorMaxDeliveryCharacters;
    const selected: BackgroundJobEvent[] = [...regular];
    // Take one batch from each monitor before taking its final buffered batch.
    while (ordered.some(([, group]) => group.length)) {
      for (const [, group] of ordered) {
        const notice = group.shift();
        if (!notice) continue;
        const size = notice.lines.reduce(
          (count, line) => count + line.length,
          0,
        );
        if (size > remaining) {
          group.length = 0; // Never deliver the end ahead of that monitor's head.
          continue;
        }
        remaining -= size;
        selected.push(notice);
      }
    }
    return selected;
  }

  take(
    notifications: readonly BackgroundJobEvent[],
    options?: MonitorDeliveryOptions,
  ): BackgroundJobEvent[] {
    const ready = this.ready(notifications, options);
    const monitors = ready.filter((notice) => "lines" in notice);
    if (monitors.length) {
      this.nextDeliveryAt = Date.now() + MonitorDeliveryIntervalMs;
      const order = ++this.order;
      for (const notice of monitors)
        this.lastServed.set(notice.backgroundJobId, order);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.onReady();
      }, MonitorDeliveryIntervalMs);
      // Keep the CLI alive until deferred final output is eligible.
    }
    return ready;
  }

  dispose() {
    clearTimeout(this.timer);
  }
}
