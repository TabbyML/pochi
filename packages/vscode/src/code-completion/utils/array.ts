declare global {
  interface Array<T> {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    distinct(identity?: (x: T) => any): Array<T>;
    mapAsync<U>(
      callbackfn: (value: T, index: number, array: T[]) => U | Promise<U>,
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      thisArg?: any,
    ): Promise<U[]>;
  }
  interface ReadonlyArray<T> {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    distinct(identity?: (x: T) => any): Array<T>;
    mapAsync<U>(
      callbackfn: (value: T, index: number, array: T[]) => U | Promise<U>,
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      thisArg?: any,
    ): Promise<U[]>;
  }
}

if (!Array.prototype.distinct) {
  Array.prototype.distinct = function <T>(
    this: T[],
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    identity?: (x: T) => any,
  ): T[] {
    return [
      ...new Map(this.map((item) => [identity?.(item) ?? item, item])).values(),
    ];
  };
}

if (!Array.prototype.mapAsync) {
  Array.prototype.mapAsync = async function <T, U>(
    this: T[],
    callbackfn: (value: T, index: number, array: T[]) => U | Promise<U>,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    thisArg?: any,
  ): Promise<U[]> {
    return await Promise.all(
      this.map((item, index) => callbackfn.call(thisArg, item, index, this)),
    );
  };
}
