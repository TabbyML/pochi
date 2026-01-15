export class ArrayWindow<T> {
  private readonly values: T[] = [];

  constructor(private readonly maxSize: number) {}

  add(value: T): void {
    this.values.push(value);
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  getValues(): readonly T[] {
    return this.values;
  }
}
