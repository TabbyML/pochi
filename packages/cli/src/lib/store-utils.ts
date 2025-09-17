import { getLogger } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import type { LiveStoreSchema } from "@livestore/livestore";

const logger = getLogger("Shutdown");

export async function shutdownStoreAndExit(
  store: Store<LiveStoreSchema>,
): Promise<void> {
  try {
    await Promise.race([
      store.shutdownPromise(),
      new Promise<void>((_, reject) =>
        setTimeout(() => {
          reject(new Error("Store shutdown timed out"));
        }, 5000),
      ),
    ]);
    process.exit(0);
  } catch (error) {
    logger.warn("Store shutdown failed", error);
    process.exit(1);
  }
}
