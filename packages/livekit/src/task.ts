import { isAbortError } from "@ai-sdk/provider-utils";
import type { GitStatus } from "@getpochi/common";
import {
  APICallError,
  type FinishReason,
  InvalidToolInputError,
  NoSuchToolError,
  isStaticToolUIPart,
} from "ai";
import type { tables } from "./livestore/default-schema";
import type { Message, Task } from "./types";

export function toTaskStatus(
  message: Message,
  finishReason?: FinishReason,
): (typeof tables.tasks.Type)["status"] {
  // Find the last index of a step-start part
  let lastStepStart = -1;
  for (let i = message.parts.length - 1; i >= 0; i--) {
    if (message.parts[i].type === "step-start") {
      lastStepStart = i;
      break;
    }
  }

  if (!finishReason) return "failed";

  let hasToolCall = false;
  for (const part of message.parts.slice(lastStepStart + 1)) {
    if (
      part.type === "tool-askFollowupQuestion" ||
      part.type === "tool-attemptCompletion" ||
      part.type === "tool-renderWidget"
    ) {
      return "completed";
    }

    if (isStaticToolUIPart(part)) {
      hasToolCall = true;
    }
  }

  if (hasToolCall) {
    return "pending-tool";
  }

  if (finishReason !== "error") {
    return "pending-input";
  }

  return "failed";
}

/**
 * Task errors are persisted in the `tasks.error` column, which is synced as a
 * single LiveStore event and mirrored into the task history file. Oversized
 * payloads (e.g. `APICallError.requestBodyValues` holds the whole request body,
 * which is huge exactly when the request was rejected for being too large)
 * would exceed the sync transport limit and wedge the store, so both the
 * message and the request body are capped here.
 */
const MaxTaskErrorMessageChars = 4_000;
const MaxRequestBodyValuesChars = 4_000;

export function truncateTaskErrorMessage(message: string): string {
  if (message.length <= MaxTaskErrorMessageChars) {
    return message;
  }
  const dropped = message.length - MaxTaskErrorMessageChars;
  return `${message.slice(0, MaxTaskErrorMessageChars)}… [truncated ${dropped} characters]`;
}

export function compactRequestBodyValues(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { omitted: "requestBodyValues is not serializable" };
  }

  if (serialized === undefined) {
    return null;
  }

  if (serialized.length <= MaxRequestBodyValuesChars) {
    return value;
  }

  return {
    omitted: "requestBodyValues too large",
    size: serialized.length,
  };
}

export function toTaskError(
  error: unknown,
): NonNullable<(typeof tables.tasks.Type)["error"]> {
  if (APICallError.isInstance(error)) {
    return {
      kind: "APICallError",
      isRetryable: error.isRetryable,
      message: truncateTaskErrorMessage(error.message),
      requestBodyValues: compactRequestBodyValues(error.requestBodyValues),
    };
  }

  const internalError = (message: string) => {
    return {
      kind: "InternalError",
      message: truncateTaskErrorMessage(message),
    } as const;
  };

  if (InvalidToolInputError.isInstance(error)) {
    return internalError(
      `Invalid arguments provided to tool "${error.toolName}". Please try again.`,
    );
  }

  if (NoSuchToolError.isInstance(error)) {
    return internalError(`${error.toolName} is not a valid tool.`);
  }

  if (isAbortError(error)) {
    return {
      kind: "AbortError",
      message: truncateTaskErrorMessage(error.message),
    };
  }

  if (!(error instanceof Error)) {
    return internalError(
      `Something went wrong. Please try again: ${JSON.stringify(error)}`,
    );
  }

  return internalError(error.message);
}

export type TaskGitInfo = NonNullable<Task["git"]> | undefined;

export const toTaskGitInfo = (gitStatus: GitStatus): TaskGitInfo => {
  if (!gitStatus) return undefined;
  return {
    origin: gitStatus.origin,
    branch: gitStatus.currentBranch,
    worktree: gitStatus.worktree,
  };
};
