export type ParsedToolSpec = {
  name: string;
  args: string[];
};

export type ToolSpecInput =
  | string
  | {
      name: string;
      args?: string[];
    };

function sanitizeArgs(args: string[] | undefined): string[] {
  return (args ?? []).map((x) => x.trim()).filter((x) => x.length > 0);
}

function parsedSpecs(tools: ToolSpecInput[] | undefined): ParsedToolSpec[] {
  return (tools ?? [])
    .map((tool) => parseToolSpec(tool))
    .filter((tool) => tool.name.length > 0);
}

/**
 * Parse a tool declaration like "executeCommand(a,b)" into name and args.
 * parseToolSpec("newTask(explore)") // => { name: "newTask", args: ["explore"] }
 */
export function parseToolSpec(tool: ToolSpecInput): ParsedToolSpec {
  if (typeof tool !== "string") {
    return {
      name: tool.name.trim(),
      args: sanitizeArgs(tool.args),
    };
  }

  const trimmed = tool.trim();
  if (!trimmed) {
    return {
      name: "",
      args: [],
    };
  }

  const match = trimmed.match(/^([a-zA-Z][\w-]*)\((.*)\)$/);
  if (!match) {
    return {
      name: trimmed,
      args: [],
    };
  }

  return {
    name: match[1],
    args: sanitizeArgs(match[2].split(",")),
  };
}

export function normalizeToolSpecs(
  tools: ToolSpecInput[] | undefined,
): ParsedToolSpec[] | undefined {
  const normalized = parsedSpecs(tools);

  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Get merged args for a tool name; undefined means unrestricted access.
 * getToolArgs(["executeCommand(agent-browser,npm)"], "executeCommand") // => ["agent-browser", "npm"]
 */
export function getToolArgs(
  tools: ToolSpecInput[] | undefined,
  toolName: string,
): string[] | undefined {
  let hasUnrestrictedTool = false;
  const allowed = new Set<string>();

  for (const parsed of parsedSpecs(tools)) {
    if (parsed.name !== toolName) {
      continue;
    }

    if (parsed.args.length === 0) {
      hasUnrestrictedTool = true;
      continue;
    }

    for (const arg of parsed.args) {
      allowed.add(arg);
    }
  }

  if (hasUnrestrictedTool || allowed.size === 0) {
    return undefined;
  }

  return [...allowed];
}

export function getAllowedToolNames(
  tools: ToolSpecInput[] | undefined,
): Set<string> {
  return new Set(parsedSpecs(tools).map((x) => x.name));
}
