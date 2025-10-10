import type { Store } from "@livestore/livestore";

export async function shutdownStoreAndExit(store: Store, exitCode = 0) {
  await store.shutdownPromise();

  // FIXME: this is a hack to make sure the process exits
  // mcpHub.dispose() is not working properly to close all subprocess, thus we have to do this.
  process.exit(exitCode);
}
