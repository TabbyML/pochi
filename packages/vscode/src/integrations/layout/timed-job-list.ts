import type * as vscode from "vscode";

export class TimedJobList<T> implements vscode.Disposable {
  private readonly map = new Map<
    T,
    { timer: ReturnType<typeof setTimeout>; jobFn: (item: T) => void }
  >();

  // push delayed job
  push(id: T, delay: number, jobFn: (id: T) => void) {
    const existing = this.map.get(id);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
      this.trigger(id);
    }, delay);
    this.map.set(id, { timer, jobFn });
  }

  // trigger immediately
  trigger(id: T) {
    const item = this.map.get(id);
    if (!item) {
      return;
    }
    const { timer, jobFn } = item;
    this.map.delete(id);
    clearTimeout(timer);
    jobFn(id);
  }

  get ids(): readonly T[] {
    return Array.from(this.map.keys());
  }

  dispose() {
    for (const { timer } of this.map.values()) {
      clearTimeout(timer);
    }
    this.map.clear();
  }
}
