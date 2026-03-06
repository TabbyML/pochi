import { getLogger } from "@/lib/logger";
import { MaxTerminalOutputSize } from "@getpochi/common/tool-utils";

const logger = getLogger("BackgroundStreamUtils");

/**
 * Processes output stream for background jobs with auto-completion after specified timeout of no output
 *
 * @param outputStream - The async iterable stream of output lines
 * @param timeoutMs - Timeout in milliseconds after which the stream auto-completes when no output is received (default: 5000ms)
 * @returns AsyncIterable<string> that yields lines and auto-completes after timeout
 */
export async function* createBackgroundOutputStream(
  outputStream: AsyncIterable<string>,
  timeoutMs = 5000,
): AsyncIterable<string> {
  const iterator = outputStream[Symbol.asyncIterator]();
  let isStreamEnded = false;

  while (!isStreamEnded) {
    // Create a fresh timeout for each iteration
    const timeoutPromise = new Promise<{ type: "timeout" }>((resolve) => {
      setTimeout(() => resolve({ type: "timeout" }), timeoutMs);
    });

    const nextPromise = iterator.next().then((result) => ({
      type: "value" as const,
      result,
    }));

    // Race between getting next value and timeout
    const raceResult = await Promise.race([nextPromise, timeoutPromise]);

    if (raceResult.type === "timeout") {
      logger.info(
        `Background job auto-completed after ${timeoutMs}ms of no output`,
      );
      break;
    }

    const { done, value } = raceResult.result;

    if (done) {
      isStreamEnded = true;
      break;
    }

    // We got a value, so yield it and continue the loop
    // The timeout will be automatically reset on the next iteration
    yield value;
  }

  // Clean up the iterator if it's still active
  if (!isStreamEnded && typeof iterator.return === "function") {
    try {
      await iterator.return();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Initial delay before starting command execution to ensure webview subscription
 */
const WebviewSubscriptionDelayMs = 250;

/**
 * Waits for webview subscription to prevent early garbage collection
 */
export const waitForWebviewSubscription = async (): Promise<void> => {
  await new Promise((resolve) =>
    setTimeout(resolve, WebviewSubscriptionDelayMs),
  );
};

/**
 * Error class for command execution failures
 */
export class ExecutionError extends Error {
  constructor(
    public readonly aborted: boolean,
    message: string,
  ) {
    super(message);
    this.name = "ExecutionError";
  }

  static create(message: string, aborted = false) {
    return new ExecutionError(aborted, message);
  }

  static createAbortError() {
    return new ExecutionError(
      true,
      "Tool execution was aborted by user, please follow the user's guidance for next steps",
    );
  }

  static createTimeoutError(timeout: number) {
    return new ExecutionError(
      false,
      `Command execution timed out after ${timeout} seconds, if it's used as background task, please consider use startBackgroundJob.`,
    );
  }
}

export const truncateOutput = (output: string) => {
  const isTruncated = output.length > MaxTerminalOutputSize;
  const finalOutput = isTruncated
    ? output.slice(-MaxTerminalOutputSize)
    : output;

  return { output: finalOutput, isTruncated };
};
