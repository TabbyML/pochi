import type { BackgroundJobNotification } from "@getpochi/common";

export const MonitorInitialWakeDelayMs = 1_000;
export const MonitorAutoWakeIntervalMs = 10_000;

/** Only controls notification-only turns; existing requests never wait here. */
export class MonitorWakeup {
  private pendingSince: number | undefined;
  private nextWakeAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private timerAt: number | undefined;
  private generation = 0;

  constructor(private readonly onReady: () => void) {}

  ready(notifications: readonly BackgroundJobNotification[]): boolean {
    if (!notifications.length) {
      this.clear();
      return false;
    }
    if (
      notifications.some((notice) => notice.kind !== "monitor" || notice.ended)
    ) {
      this.clear();
      return true;
    }
    this.pendingSince ??= Date.now();
    const deadline = Math.max(
      this.pendingSince + MonitorInitialWakeDelayMs,
      this.nextWakeAt,
    );
    if (Date.now() >= deadline) return true;
    if (this.timerAt !== deadline) {
      clearTimeout(this.timer);
      this.timerAt = deadline;
      // Keep CLI waiting until the deadline even if there is no more output.
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.timerAt = undefined;
        this.onReady();
      }, deadline - Date.now());
    }
    return false;
  }

  /** Reserve the task's next wakeup before a sender can reenter. */
  started(): () => void {
    const previous = this.nextWakeAt;
    const pendingSince = this.pendingSince;
    const generation = ++this.generation;
    this.nextWakeAt = Date.now() + MonitorAutoWakeIntervalMs;
    this.clear();
    return () => {
      if (generation !== this.generation) return;
      this.nextWakeAt = previous;
      this.pendingSince = pendingSince;
    };
  }

  clear(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.timerAt = undefined;
    this.pendingSince = undefined;
  }
}
