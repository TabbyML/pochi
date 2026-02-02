export class TimedList<T> {
  private items: T[] = [];
  private timers: Map<T, ReturnType<typeof setTimeout>> = new Map();

  add(item: T, duration = 1000) {
    if (this.timers.has(item)) {
      clearTimeout(this.timers.get(item));
    }
    if (!this.items.includes(item)) {
      this.items.push(item);
    }

    // Set a timer to remove the item after the specified duration.
    const timer = setTimeout(() => {
      this.remove(item);
    }, duration);

    this.timers.set(item, timer);
  }

  remove(item: T) {
    const index = this.items.indexOf(item);
    if (index > -1) {
      this.items.splice(index, 1);
    }

    if (this.timers.has(item)) {
      clearTimeout(this.timers.get(item));
      this.timers.delete(item);
    }
  }

  getItems(): readonly T[] {
    return this.items;
  }
}
