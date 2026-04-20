import { parse } from "shell-quote";

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
 * getToolArgs(["executeCommand(agent-browser)", "executeCommand(npm)"], "executeCommand") // => ["agent-browser", "npm"]
 */
export function getToolArgs(
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

    const args =
      toolName === "executeCommand"
        ? getExecuteCommandArgs(tool, parsed)
        : parsed.args;

    if (args.length === 0) {
      hasUnrestrictedTool = true;
      continue;
    }

    for (const arg of args) {
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

function splitCommandSegments(command: string): string[] {
  const parsed = parse(command);
  const segments: string[] = [];
  let currentSegment: string[] = [];

  for (const token of parsed) {
    if (typeof token === "object" && "op" in token) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment.join(" "));
        currentSegment = [];
      }
    } else {
      currentSegment.push(String(token));
    }
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment.join(" "));
  }

  return segments.map((x) => x.trim()).filter((x) => x.length > 0);
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function extractCommandToken(command: string): string | undefined {
  const trimmed = normalizeWhitespace(command);
  if (!trimmed) {
    return undefined;
  }

  const firstSpace = trimmed.indexOf(" ");
  return firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
}

function matchSegmentPattern(segment: string, pattern: string): boolean {
  const normalizedSegment = normalizeWhitespace(segment);
  const normalizedPattern = normalizeWhitespace(pattern);

  if (!normalizedPattern) {
    return false;
  }

  if (normalizedPattern.includes("*")) {
    const regex = new RegExp(
      `^${escapeRegex(normalizedPattern).replace(/\\\*/g, ".*")}$`,
    );
    return regex.test(normalizedSegment);
  }

  if (!normalizedPattern.includes(" ")) {
    // Backward-compatible mode: single-token pattern matches command token.
    return extractCommandToken(normalizedSegment) === normalizedPattern;
  }

  // Multi-token pattern without wildcard means exact command-segment match.
  return normalizedSegment === normalizedPattern;
}

export function validateExecuteCommandWhitelist(
  command: string,
  whitelist: string[],
): void {
  const segments = splitCommandSegments(command);

  for (const segment of segments) {
    const matched = whitelist.some((pattern) =>
      matchSegmentPattern(segment, pattern),
    );

    if (!matched) {
      throw new Error(
        `Command is not allowed by the configured command rules. Allowed command patterns: ${whitelist.join(", ")}`,
      );
    }
  }
}

function getExecuteCommandArgs(
  tool: ToolSpecInput,
  parsed: ParsedToolSpec,
): string[] {
  if (typeof tool !== "string") {
    return parsed.args.length > 0 ? [parsed.args.join(",")] : [];
  }

  const trimmed = tool.trim();
  if (trimmed === "executeCommand") {
    return [];
  }

  const match = trimmed.match(/^executeCommand\((.*)\)$/);
  if (!match) {
    return parsed.args;
  }

  const inner = match[1].trim();
  return inner.length > 0 ? [inner] : [];
}
