import type { ReadonlySignal } from "@preact/signals-core";
import {
  ThreadSignal,
  type ThreadSignalSerialization,
} from "@quilted/threads/signals";

/** Close the gap between reading a signal's initial value and subscribing. */
export function serializeThreadSignalWithSnapshot<T>(
  signal: ReadonlySignal<T>,
): ThreadSignalSerialization<T> {
  const serialized = ThreadSignal.serialize(signal);
  return {
    ...serialized,
    async start(subscriber, options) {
      serialized.start(subscriber, options);
      // Subscribe first, then send the current value. Await delivery so callers
      // can finish initialization with a current snapshot across the RPC bridge.
      await subscriber(signal.peek());
    },
  };
}
