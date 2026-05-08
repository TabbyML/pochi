export type ParsedToolSpec = {
  name: string;
  rules: string[];
};

export type ToolSpecInput =
  | string
  | {
      name: string;
      rules?: string[];
    };

function sanitizeRules(rules: string[] | undefined): string[] {
  return (rules ?? []).map((x) => x.trim()).filter((x) => x.length > 0);
}

function parseToolSpecs(tools: ToolSpecInput[] | undefined): ParsedToolSpec[] {
  return (tools ?? [])
    .map((tool) => parseToolSpec(tool))
    .filter((tool) => tool.name.length > 0);
}

/**
 * Parse a tool declaration such as "executeCommand(git status)".
 *
 * This helper only understands the top-level `toolName(rule)` shape used in
 * custom agent tool configuration. String declarations may contain at most one
 * rule value. If a caller needs multiple rule values, it should provide
 * multiple declarations instead of `tool(a, b)`.
 */
export function parseToolSpec(tool: ToolSpecInput): ParsedToolSpec {
  if (typeof tool !== "string") {
    return {
      name: tool.name.trim(),
      rules: sanitizeRules(tool.rules),
    };
  }

  const trimmed = tool.trim();
  if (!trimmed) {
    return {
      name: "",
      rules: [],
    };
  }

  const match = trimmed.match(/^([a-zA-Z][\w-]*)\((.*)\)$/);
  if (!match) {
    return {
      name: trimmed,
      rules: [],
    };
  }

  return {
    name: match[1],
    rules: parseToolRules(trimmed, match[2]),
  };
}

function parseToolRules(tool: string, rawRule: string): string[] {
  const rule = rawRule.trim();
  if (!rule) {
    return [];
  }

  if (rule.includes(",")) {
    throw new Error(
      `Invalid tool declaration "${tool}". Use one declaration per tool rule, for example: readFile(src/**), readFile(pochi://-/plan.md).`,
    );
  }

  return [rule];
}

export function normalizeToolSpecs(
  tools: ToolSpecInput[] | undefined,
): ParsedToolSpec[] | undefined {
  const normalized = parseToolSpecs(tools);

  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Collect the configured rules for a tool.
 *
 * Returning `undefined` means the tool is enabled without any policy
 * restriction. Multiple rules can still be provided by repeating tool
 * declarations or, for object-form specs, by passing multiple rules.
 */
export function getToolRules(
  tools: ToolSpecInput[] | undefined,
  toolName: string,
): string[] | undefined {
  let hasUnrestrictedTool = false;
  const allowed = new Set<string>();

  for (const tool of tools ?? []) {
    const parsed = parseToolSpec(tool);
    if (parsed.name !== toolName) {
      continue;
    }

    const rules = parsed.rules;

    if (rules.length === 0) {
      hasUnrestrictedTool = true;
      continue;
    }

    for (const rule of rules) {
      allowed.add(rule);
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
  return new Set(parseToolSpecs(tools).map((x) => x.name));
}
