import type { MaybePromise } from "@getpochi/common";

export type MemoryStateStore<T> = {
  get(): T | undefined;
  set(state: T): MaybePromise<void>;
};

export function createMemoryStateStore<T>(
  initialState: T,
): MemoryStateStore<T> {
  let state = initialState;
  return {
    get: () => state,
    set: (nextState) => {
      state = nextState;
    },
  };
}
