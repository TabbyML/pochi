import { getLogger } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import type { LiveStoreSchema } from "@livestore/livestore";
import { Effect } from "@livestore/utils/effect";

const logger = getLogger("Shutdown");

export async function shutdownStoreAndExit(
  store: Store<LiveStoreSchema>,
): Promise<void> {
  await Promise.race([
    Effect.runPromise(store.shutdown())
      .then(() => {
        logger.debug("Store shutdown completed");
        process.exit(0);
      })
      .catch(() => {
        logger.debug("Store shutdown failed, continuing...");
        process.exit(1);
      }),
    new Promise<void>(() =>
      setTimeout(() => {
        logger.debug("Store shutdown timed out, continuing...");
        process.exit(1);
      }, 5000),
    ),
  ]);
}
