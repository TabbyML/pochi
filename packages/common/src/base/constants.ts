export const KnownTags = [
  "file",
  "compact",
  "custom-agent",
  "skill",
  "issue",
] as const;

export const CompactTaskMinTokens = 50_000;

export const DefaultContextWindow = 100_000;
export const DefaultMaxOutputTokens = 4096;

export const PochiTaskIdHeader = "x-pochi-task-id";
export const PochiClientHeader = "x-pochi-client";
export const PochiRequestUseCaseHeader = "x-pochi-request-use-case";

export const EnableAsyncNewTask = true;

/**
 * Timeout (ms) for any single git operation.
 * Used across all git invocations (simple-git block timeout, exec timeout)
 * to prevent hangs when git itself is broken or unresponsive.
 */
export const GitOperationTimeoutMs = 10_000;
