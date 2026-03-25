import { getLogger } from "./logger";

const logger = getLogger("AsyncUtils");

/**
 * Wraps a promise with a timeout. Returns null if the timeout is reached.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      logger.warn(`${operationName} timed out after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
