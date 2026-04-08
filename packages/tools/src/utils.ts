export type ParsedToolSpec = {
  name: string;
  args: string[];
};

/**
 * Parse a tool declaration like "executeCommand(a,b)" into name and args.
 * parseToolSpec("newTask(explore)") // => { name: "newTask", args: ["explore"] }
 */
export function parseToolSpec(tool: string): ParsedToolSpec {
  const trimmed = tool.trim();
  if (!trimmed) {
    return {
      name: "",
      args: [],
    };
  }

  if (!trimmed.includes("(")) {
    return {
      name: trimmed,
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
    args: match[2]
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0),
  };
}

/**
 * Get merged args for a tool name; undefined means unrestricted access.
 * getToolArgs(["executeCommand(agent-browser,npm)"], "executeCommand") // => ["agent-browser", "npm"]
 */
export function getToolArgs(
  tools: string[] | undefined,
  toolName: string,
): string[] | undefined {
  let hasUnrestrictedTool = false;
  const allowed = new Set<string>();

  for (const tool of tools ?? []) {
    const parsed = parseToolSpec(tool);
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

export function getAllowedToolNames(tools: string[] | undefined): Set<string> {
  const enabled = new Set<string>();
  for (const tool of tools ?? []) {
    const parsed = parseToolSpec(tool);
    if (parsed.name) {
      enabled.add(parsed.name);
    }
  }
  return enabled;
}
