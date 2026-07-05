import { Schema, deprecated } from "@livestore/livestore";

export const DBTextUIPart = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
  state: Schema.optional(Schema.Literal("streaming", "done")),
});

export const DBUIPart = Schema.Union(DBTextUIPart, Schema.Unknown);

export const DBMessage = Schema.Struct({
  id: Schema.String,
  role: Schema.Literal("user", "assistant", "system"),
  parts: Schema.Array(DBUIPart),
});

export const Todo = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
  status: Schema.Literal("pending", "in-progress", "completed", "cancelled"),
  priority: Schema.Literal("low", "medium", "high"),
});

export const Todos = Schema.Array(Todo);

export const ToolCall = Schema.Unknown;
export const ToolCalls = Schema.Array(ToolCall);

export const LineChanges = Schema.Struct({
  added: Schema.Number,
  removed: Schema.Number,
});

export const TaskStatus = Schema.Literal(
  "completed",
  "pending-input",
  "failed",
  "pending-tool",
  "pending-model",
);

export const TaskError = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("InternalError"),
    message: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("APICallError"),
    isRetryable: Schema.Boolean,
    message: Schema.String,
    requestBodyValues: Schema.Unknown,
  }),
  Schema.Struct({
    kind: Schema.Literal("AbortError"),
    message: Schema.String,
  }),
);

export const Git = Schema.Struct({
  /**
   * The remote URL of the repository
   */
  origin: Schema.optional(Schema.String),
  worktree: Schema.optional(
    Schema.Struct({
      /**
       * The gitdir path stored in worktree .git file.
       */
      gitdir: Schema.String,
    }),
  ),
  /**
   * The current branch name of the worktree
   */
  branch: Schema.String,
});

export const taskInitFields = {
  id: Schema.String,
  parentId: Schema.optional(Schema.String),
  runAsync: Schema.optional(Schema.Boolean).pipe(
    deprecated("Async newTask is removed"),
  ),
  background: Schema.optional(Schema.Boolean),
  cwd: Schema.optional(Schema.String),
  createdAt: Schema.Date,
  modelId: Schema.optional(Schema.String),
};

const ExecutionDurationTracker = Schema.Struct({
  /**
   * Accumulated duration (in ms) for this execution type.
   * Null when nothing has been accumulated yet.
   */
  accumulatedDuration: Schema.NullOr(Schema.Number),
  /**
   * Timestamp when the current segment started.
   * Null when no segment is in progress.
   */
  startedAt: Schema.NullOr(Schema.Date),
});

export const ExecutionDuration = Schema.Struct({
  /**
   * Completed step durations keyed by the tool-call id of the attemptCompletion tool call.
   * Each entry records tool-call and streaming time separately.
   */
  completedDurations: Schema.NullOr(
    Schema.Array(
      Schema.Struct({
        key: Schema.String,
        value: Schema.Struct({
          streamingDuration: Schema.Number,
          toolCallsDuration: Schema.Number,
        }),
      }),
    ),
  ),
  /**
   * Per-type trackers for the currently in-flight execution step.
   * Null when no execution step is in progress.
   */
  current: Schema.NullOr(
    Schema.Struct({
      streaming: Schema.NullOr(ExecutionDurationTracker),
      toolCall: Schema.NullOr(ExecutionDurationTracker),
    }),
  ),
});

export type ExecutionDurationType = Schema.Schema.Type<
  typeof ExecutionDuration
>;

export const taskFullFields = {
  ...taskInitFields,
  background: Schema.optional(Schema.Boolean),
  git: Schema.optional(Git),
  shareId: Schema.optional(Schema.String),
  isPublicShared: Schema.Boolean,
  title: Schema.optional(Schema.String),
  status: TaskStatus,
  todos: Todos,
  pendingToolCalls: Schema.optional(ToolCalls),
  totalTokens: Schema.optional(Schema.Number),
  lineChanges: Schema.optional(LineChanges),
  lastStepDuration: Schema.optional(Schema.DurationFromMillis),
  lastCheckpointHash: Schema.optional(Schema.String),
  error: Schema.optional(TaskError),
  executionDuration: Schema.optional(ExecutionDuration),
  updatedAt: Schema.Date,
  displayId: Schema.optional(Schema.Number).pipe(
    deprecated("Concept of displayId is removed"),
  ),
};
