import type {
  BackgroundJobNotification,
  BackgroundMonitorNotification,
} from "@getpochi/common";

export const MonitorMaxDeliveryCharacters = 32 * 1024;

/** A shared per-task delivery budget with fair ordering across monitors. */
export class MonitorDelivery {
  private order = 0;
  private readonly lastServed = new Map<string, number>();

  ready(
    notifications: readonly BackgroundJobNotification[],
    maxCharacters = MonitorMaxDeliveryCharacters,
  ): BackgroundJobNotification[] {
    const regular = notifications.filter((notice) => notice.kind !== "monitor");

    const groups = new Map<string, BackgroundMonitorNotification[]>();
    for (const notice of notifications) {
      if (notice.kind !== "monitor") continue;
      const group = groups.get(notice.backgroundJobId) ?? [];
      group.push(notice);
      groups.set(notice.backgroundJobId, group);
    }
    const ordered = [...groups].sort(
      ([a], [b]) =>
        (this.lastServed.get(a) ?? 0) - (this.lastServed.get(b) ?? 0),
    );
    let remaining = Math.max(
      0,
      Math.min(maxCharacters, MonitorMaxDeliveryCharacters),
    );
    const selected: BackgroundJobNotification[] = [...regular];
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
    notifications: readonly BackgroundJobNotification[],
    maxCharacters = MonitorMaxDeliveryCharacters,
  ): BackgroundJobNotification[] {
    const ready = this.ready(notifications, maxCharacters);
    const monitors = ready.filter((notice) => notice.kind === "monitor");
    if (monitors.length) {
      const order = ++this.order;
      for (const notice of monitors)
        this.lastServed.set(notice.backgroundJobId, order);
    }
    return ready;
  }
}
