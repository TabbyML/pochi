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

export const DefaultEffectiveContextWindow = 160_000;
export const MinEffectiveContextWindow = 64_000;

export const StreamingUpdateThrottleMs = 100;

export const AttemptTodoCompletionAgentName = "attemptTodoCompletion";

export const PochiTaskIdHeader = "x-pochi-task-id";
export const PochiStoreIdHeader = "x-pochi-store-id";
export const PochiClientHeader = "x-pochi-client";
export const PochiRequestUseCaseHeader = "x-pochi-request-use-case";

/**
 * Task Memory extracts once per compaction cycle. Everything after the
 * extraction boundary survives compaction verbatim, so a second extraction in
 * the same cycle would only shrink that tail; only failures are retried.
 */
export const TaskMemoryExtractionThresholdRatio = 0.8;
export const MaxTaskMemoryExtractionAttemptsPerCycle = 2;
export const TaskMemoryFallbackCompactThreshold = 120_000;

/**
 * Timeout (ms) for any single git operation.
 * Used across all git invocations (simple-git block timeout, exec timeout)
 * to prevent hangs when git itself is broken or unresponsive.
 */
export const GitOperationTimeoutMs = 10_000;

/**
 * Block timeout (ms) for `git worktree remove`, which is mostly filesystem
 * IO and frequently exceeds the default 10s while git is still deleting.
 */
export const WorktreeRemoveTimeoutMs = 60_000;
