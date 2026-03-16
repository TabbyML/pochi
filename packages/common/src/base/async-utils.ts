import { getLogger } from "./logger";

const logger = getLogger("AsyncUtils");

/**
 * Wraps a promise with a timeout. If the promise does not resolve within
 * `timeoutMs`, the returned promise resolves with `undefined` and logs a
 * warning.
 *
 * @param promise - The promise to race against the timeout.
 * @param timeoutMs - Maximum time in milliseconds to wait.
 * @param label - A descriptive label used in the warning log message.
 * @returns The resolved value of the promise, or `undefined` if it timed out.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T | undefined> {
  const timeoutPromise = new Promise<undefined>((resolve) => {
    setTimeout(() => {
      logger.warn(
        `${label} timed out after ${timeoutMs}ms, returning undefined`,
      );
      resolve(undefined);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}
