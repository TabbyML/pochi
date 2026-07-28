/**
 * Known XML-style tags that should be preserved in messages during markdown parsing/formatting
 * or escaped/handled specially to avoid breaking HTML rendering.
 */
export const KnownTags = [
  "file",
  "compact",
  "custom-agent",
  "skill",
  "issue",
] as const;

/**
 * Minimum number of total tokens in a task session required before auto-compaction (summarization)
 * is allowed or triggered.
 */
export const CompactTaskMinTokens = 50_000;

/**
 * Default context window size (in tokens) used if a model does not declare its own context window.
 */
export const DefaultContextWindow = 100_000;

/**
 * Default maximum output tokens for LLM generation if not specified by the model's options.
 */
export const DefaultMaxOutputTokens = 4096;

/**
 * Default effective context window threshold (in tokens) at which auto-compaction triggers,
 * even if the model declares a larger context window. This is because agentic tasks tend to
 * degrade in quality when the context grows too large.
 */
export const DefaultEffectiveContextWindow = 160_000;

/**
 * Minimum allowable effective context window threshold (in tokens) for auto-compaction.
 */
export const MinEffectiveContextWindow = 64_000;

/**
 * Throttle duration (in milliseconds) for streaming UI updates from the chat or sub-tasks,
 * used to prevent rendering lag by batching rapid updates.
 */
export const StreamingUpdateThrottleMs = 100;

/**
 * The reserved internal agent name used when executing the sub-task that attempts to
 * verify and complete active todos.
 */
export const AttemptTodoCompletionAgentName = "attemptTodoCompletion";

/**
 * HTTP header key used to pass the current Pochi task ID to remote API requests.
 */
export const PochiTaskIdHeader = "x-pochi-task-id";

/**
 * HTTP header key used to pass the current Pochi store ID to remote API requests.
 */
export const PochiStoreIdHeader = "x-pochi-store-id";

/**
 * HTTP header key used to identify the Pochi client (e.g. VS Code, CLI) making the request.
 */
export const PochiClientHeader = "x-pochi-client";

/**
 * HTTP header key used to indicate the specific use case or intent of the request.
 */
export const PochiRequestUseCaseHeader = "x-pochi-request-use-case";

/**
 * Task Memory thresholds — background extraction of session notes.
 */
export const TaskMemoryInitTokenThreshold = 10_000;
export const TaskMemoryUpdateTokenIncrement = 5_000;
export const TaskMemoryUpdateToolCallThreshold = 3;

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
