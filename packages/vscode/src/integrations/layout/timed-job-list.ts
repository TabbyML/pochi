export class TimedJobList<T> {
  private readonly list: {
    id: T;
    timer: ReturnType<typeof setTimeout>;
    jobFn: (item: T) => void;
  }[] = [];

  // push delayed job
  push(id: T, delay: number, jobFn: (id: T) => void) {
    const timer = setTimeout(() => {
      this.trigger(id);
    }, delay);
    this.list.push({ id, timer, jobFn: jobFn });
  }

  // trigger immediately
  trigger(id: T) {
    const index = this.list.findIndex((i) => i.id === id);
    if (index < 0) {
      return;
    }
    const [{ timer, jobFn }] = this.list.splice(index, 1);
    clearTimeout(timer);
    jobFn(id);
  }

  get ids(): readonly T[] {
    return this.list.map((i) => i.id);
  }
}
