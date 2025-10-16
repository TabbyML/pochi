export interface StepInfo {
  /**
   * A round means runner sends a new message or tool call result to the server.
   */
  step: number;
  /**
   * A retry means runner sends the last message again to resume the task, without appending a new message or tool call result.
   */
  retry: number;
}

export function stepToString(stepInfo: StepInfo): string {
  if (stepInfo.retry > 0) {
    return `Round ${stepInfo.step} (Retry ${stepInfo.retry})`;
  }
  return `Round ${stepInfo.step}`;
}

export class MaxRoundReachedError extends Error {
  constructor(readonly maxRounds: number) {
    super(`Task aborted: maximum number of rounds reached (${maxRounds}).`);
    this.name = "AbortError";
  }
}

export class MaxRetryReachedError extends Error {
  constructor(readonly maxRetries: number) {
    super(`Task aborted: maximum number of retries reached (${maxRetries}).`);
    this.name = "AbortError";
  }
}

/**
 * A step of the runner loop.
 * The runner loads the task, processes messages, then sends results to the server.
 */
export class StepCount implements StepInfo {
  step = 1;
  retry = 0;

  constructor(
    readonly maxSteps: number,
    readonly maxRetries: number,
  ) {}

  reset() {
    this.step = 1;
    this.retry = 0;
  }

  willReachMaxSteps() {
    return this.step >= this.maxSteps - 1;
  }

  throwIfReachedMaxSteps() {
    if (this.step >= this.maxSteps) {
      throw new MaxRoundReachedError(this.maxSteps);
    }
  }

  nextStep() {
    this.throwIfReachedMaxSteps();
    this.step++;
    this.retry = 0;
  }

  throwIfReachedMaxRetries() {
    if (this.retry >= this.maxRetries) {
      throw new MaxRetryReachedError(this.maxRetries);
    }
  }

  nextRetry() {
    this.throwIfReachedMaxRetries();
    this.retry++;
  }

  toString() {
    return stepToString(this);
  }
}
