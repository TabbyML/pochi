export interface StepInfo {
  /**
   * A round means runner sends a new message or tool call result to the server.
   */
  round: number;
  /**
   * A retry means runner sends the last message again to resume the task, without appending a new message or tool call result.
   */
  retry: number;
}

export function stepToString(stepInfo: StepInfo): string {
  if (stepInfo.retry > 0) {
    return `Round ${stepInfo.round} (Retry ${stepInfo.retry})`;
  }
  return `Round ${stepInfo.round}`;
}

const DefaultMaxRounds = 24;
const DefaultMaxRetries = 3;

/**
 * A step of the runner loop.
 * The runner loads the task, processes messages, then sends results to the server.
 */
export class StepCount implements StepInfo {
  round = 1;
  retry = 0;

  constructor(
    readonly maxRounds = DefaultMaxRounds,
    readonly maxRetries = DefaultMaxRetries,
  ) {}

  reset() {
    this.round = 1;
    this.retry = 0;
  }

  willReachMaxRounds() {
    return this.round >= this.maxRounds - 1;
  }

  throwIfReachedMaxRounds() {
    if (this.round >= this.maxRounds) {
      throw new Error(`Reached max rounds (${this.maxRounds}).`);
    }
  }

  nextRound() {
    this.throwIfReachedMaxRounds();
    this.round++;
    this.retry = 0;
  }

  throwIfReachedMaxRetries() {
    if (this.retry >= this.maxRetries) {
      throw new Error(`Reached max retries (${this.maxRetries}).`);
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
