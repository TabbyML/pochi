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
