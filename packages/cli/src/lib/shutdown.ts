import type { Store } from "@livestore/livestore";

/**
 * Creates an AbortController with graceful shutdown handlers for SIGINT and SIGTERM.
 * The handlers are automatically cleaned up when the controller is aborted.
 * @returns An AbortController that will be aborted on process termination signals
 */
export function createAbortControllerWithGracefulShutdown(): AbortController {
  const abortController = new AbortController();
  let isShuttingDown = false;

  const handleShutdown = (signal: string, _exitCode: number) => {
    return () => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      if (!abortController.signal.aborted) {
        abortController.abort(new Error(`Process interrupted by ${signal}`));
      }
    };
  };

  const sigintHandler = handleShutdown("SIGINT", 130);
  const sigtermHandler = handleShutdown("SIGTERM", 143);

  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigtermHandler);

  // Clean up handlers when the controller is aborted
  abortController.signal.addEventListener("abort", () => {
    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigtermHandler);
  });

  return abortController;
}

export async function shutdownStoreAndExit(store: Store, exitCode = 0) {
  await store.shutdownPromise();

  // FIXME: this is a hack to make sure the process exits
  // mcpHub.dispose() is not working properly to close all subprocess, thus we have to do this.
  process.exit(exitCode);
}
