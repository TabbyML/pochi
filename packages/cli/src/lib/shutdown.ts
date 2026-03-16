export class ProcessAbortError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = "ProcessAbortError";
  }
}

/**
 * Creates an AbortController with graceful shutdown handlers for SIGINT and SIGTERM.
 * The handlers are automatically cleaned up when the controller is aborted.
 * @returns An AbortController that will be aborted on process termination signals
 */
export function createAbortControllerWithGracefulShutdown(): AbortController {
  const abortController = new AbortController();

  const handleShutdown = (signal: "SIGINT" | "SIGTERM") => {
    if (!abortController.signal.aborted) {
      let exitCode = 1;
      switch (signal) {
        case "SIGINT":
          exitCode = 128 + 2;
          break;
        case "SIGTERM":
          exitCode = 128 + 15;
          break;
        default:
          break;
      }
      abortController.abort(
        new ProcessAbortError(`Process interrupted by ${signal}`, exitCode),
      );
    }
  };

  const sigintHandler = () => handleShutdown("SIGINT");
  const sigtermHandler = () => handleShutdown("SIGTERM");

  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigtermHandler);

  // Clean up handlers when the controller is aborted
  abortController.signal.addEventListener("abort", () => {
    process.off("SIGINT", sigintHandler);
    process.off("SIGTERM", sigtermHandler);
  });

  return abortController;
}
