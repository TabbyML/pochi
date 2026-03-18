import { getLogger } from "./logger";

const logger = getLogger("AsyncUtils");

/**
 * Races a promise against a timeout.
 * If the promise resolves before the timeout, its value is returned.
 * If the timeout fires first, `undefined` is returned and an optional warning is logged.
 *
 * @param promise - The promise to race against the timeout.
 * @param timeoutMs - The timeout in milliseconds.
 * @param timeoutMessage - Optional message to log when the timeout fires.
 * @returns The resolved value of the promise, or `undefined` on timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage?: string,
): Promise<T | undefined> {
  const timeoutPromise = new Promise<undefined>((resolve) => {
    setTimeout(() => {
      if (timeoutMessage) {
        logger.warn(timeoutMessage);
      }
      resolve(undefined);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}
