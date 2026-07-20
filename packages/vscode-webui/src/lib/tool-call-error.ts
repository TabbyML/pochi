import {
  type ToolCallCancelReason,
  getToolCallCancelErrorMessage,
} from "@getpochi/tools";
import type { ToolUIPart } from "ai";

/**
 * Extracts the error message from a ToolUIPart if it represents an error state.
 *
 * @param tool - The tool UI part to check for errors.
 * @returns The error message string if an error is found; otherwise, undefined.
 */
export function getToolPartError(tool: ToolUIPart): string | undefined {
  if (tool.state === "output-error") {
    return getNonEmptyString(tool.errorText);
  }

  if (
    tool.state === "output-available" &&
    typeof tool.output === "object" &&
    tool.output !== null &&
    "error" in tool.output
  ) {
    return getNonEmptyString(tool.output.error);
  }

  return undefined;
}

/**
 * Extracts the error message from a raw tool execution result object.
 *
 * @param result - The raw result to inspect.
 * @returns The error message if the result is an object containing a non-empty string "error" property; otherwise, undefined.
 */
export function getToolResultError(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null || !("error" in result)) {
    return undefined;
  }

  return getNonEmptyString(result.error);
}

/**
 * Helper function to validate and return a value if it is a non-empty string.
 *
 * @param value - The value to check.
 * @returns The string value if it is a non-empty string; otherwise, undefined.
 */
function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Returns a human-readable error message for a tool call that was cancelled
 * before it could execute, based on the cancel reason.
 */
export function getToolCallErrorMessage(
  reason: ToolCallCancelReason | "user-reject",
): string {
  switch (reason) {
    case "user-abort":
    case "previous-tool-call-failed":
      return getToolCallCancelErrorMessage(reason);
    case "user-reject":
      return "User rejected the tool call";
    default:
      return "Tool call was cancelled";
  }
}

/**
 * Determines whether a given error message indicates that a tool call was cancelled.
 *
 * @param error - The error message to evaluate.
 * @returns True if the error matches any known tool call cancellation messages; otherwise, false.
 */
export function isToolCallCancellationError(
  error: string | undefined,
): boolean {
  return (
    error === getToolCallErrorMessage("user-abort") ||
    error === getToolCallErrorMessage("previous-tool-call-failed") ||
    error === "Tool call was cancelled"
  );
}
