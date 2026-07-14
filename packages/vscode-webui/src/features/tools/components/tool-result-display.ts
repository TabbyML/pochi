import { isAttemptTodoCompletionResolved } from "@/lib/todos-utils";

export type ToolResultDisplay =
  | {
      type: "json";
      content: string;
    }
  | {
      type: "markdown";
      content: string;
    };

export function getAttemptCompletionResultDisplay(
  result: unknown,
): ToolResultDisplay {
  const parsed = parseJsonObjectString(result);
  if (parsed) {
    return {
      type: "json",
      content: JSON.stringify(parsed, null, 2),
    };
  }

  if (typeof result === "string") {
    return {
      type: "markdown",
      content: result,
    };
  }

  return {
    type: "json",
    content: JSON.stringify(result, null, 2),
  };
}

export function isAttemptTodoCompletionUnsuccessful(tool: {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}): boolean {
  if (
    tool.type !== "tool-newTask" ||
    tool.state !== "output-available" ||
    !isRecord(tool.input) ||
    tool.input.agentType !== "attemptTodoCompletion"
  ) {
    return false;
  }

  return isAttemptTodoCompletionResolved(tool.output) !== true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseJsonObjectString(value: unknown): object | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return undefined;
  }
}
