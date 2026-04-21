import type { ToolUIPart } from "ai";

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

export function getToolResultError(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null || !("error" in result)) {
    return undefined;
  }

  return getNonEmptyString(result.error);
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Returns a human-readable error message for a tool call that was cancelled
 * before it could execute, based on the cancel reason.
 */
export function getToolCancelErrorMessage(
  reason: "user-abort" | "user-reject" | "previous-tool-call-failed",
): string {
  switch (reason) {
    case "user-abort":
      return "User aborted the tool call";
    case "user-reject":
      return "User rejected the tool call";
    case "previous-tool-call-failed":
      return "Tool call was cancelled because a previous tool call failed.";
    default:
      return "Tool call was cancelled";
  }
}
