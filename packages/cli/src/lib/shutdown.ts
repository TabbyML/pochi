import { getLogger } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import type { LiveStoreSchema } from "@livestore/livestore";
import { Effect } from "@livestore/utils/effect";

const logger = getLogger("Shutdown");

/**
 * Safely shutdown the store with timeout
 * - Triggers store shutdown but doesn't wait indefinitely
 * - Has a timeout to prevent hanging
 * - Always resolves, never blocks the process
 */
export async function safeShutdownStore(
  store: Store<LiveStoreSchema>,
): Promise<void> {
  return new Promise<void>((resolve) => {
    // Set timeout to ensure we don't wait forever
    const timeout = setTimeout(() => {
      logger.debug("Store shutdown timed out, continuing...");
      resolve();
    }, 5000);

    // Trigger store shutdown but don't wait for it
    Effect.runPromise(store.shutdown())
      .then(() => {
        clearTimeout(timeout);
        logger.debug("Store shutdown completed");
        resolve();
      })
      .catch(() => {
        clearTimeout(timeout);
        logger.debug("Store shutdown failed, continuing...");
        resolve();
      });
  });
}
