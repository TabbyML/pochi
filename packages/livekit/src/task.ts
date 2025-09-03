import { isAbortError } from "@ai-sdk/provider-utils";
import {
  APICallError,
  type FinishReason,
  InvalidToolInputError,
  NoSuchToolError,
  isToolUIPart,
} from "ai";
import type { tables } from "./livestore/schema";
import type { Message } from "./types";

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

  for (const part of message.parts.slice(lastStepStart + 1)) {
    if (
      part.type === "tool-askFollowupQuestion" ||
      part.type === "tool-attemptCompletion"
    ) {
      return "completed";
    }

    if (isToolUIPart(part)) {
      return "pending-tool";
    }
  }

  if (finishReason !== "error") {
    return "pending-input";
  }

  return "failed";
}

const parseAPICallError = (error: unknown): APICallError | undefined => {
  if (error instanceof Error) {
    if (APICallError.isInstance(error)) {
      return error;
    }
    try {
      const errorObject = JSON.parse(error.message);
      if (
        errorObject &&
        typeof errorObject === "object" &&
        "name" in errorObject &&
        "message" in errorObject &&
        "url" in errorObject &&
        "isRetryable" in errorObject &&
        "requestBodyValues" in errorObject &&
        "responseHeaders" in errorObject
      ) {
        return new APICallError({
          message: errorObject.message,
          url: errorObject.url,
          isRetryable: errorObject.isRetryable,
          requestBodyValues: errorObject.requestBodyValues,
          responseHeaders: errorObject.responseHeaders,
        });
      }
    } catch (error) {
      // ignore JSON parse error
    }
  }
};

export function toTaskError(
  error: unknown,
): NonNullable<(typeof tables.tasks.Type)["error"]> {
  const apiCallError = parseAPICallError(error);

  if (apiCallError) {
    return {
      kind: "APICallError",
      url: apiCallError.url,
      isRetryable: apiCallError.isRetryable,
      message: apiCallError.message,
      requestBodyValues: apiCallError.requestBodyValues,
      responseHeaders: apiCallError.responseHeaders,
    };
  }

  const internalError = (message: string) => {
    return {
      kind: "InternalError",
      message,
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
      message: error.message,
    };
  }

  if (!(error instanceof Error)) {
    return internalError(
      `Something went wrong. Please try again: ${JSON.stringify(error)}`,
    );
  }

  return internalError(error.message);
}
