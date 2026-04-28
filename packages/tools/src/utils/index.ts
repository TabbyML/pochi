import * as path from "node:path";
import { minimatch } from "minimatch";
import { parse } from "shell-quote";
import type { CompiledToolPolicies } from "../types";

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

export function compileToolPolicies(
  tools: ToolSpecInput[] | undefined,
): CompiledToolPolicies | undefined {
  const executeCommandRules = getToolRules(tools, "executeCommand");
  const policies: CompiledToolPolicies = {};

  if (executeCommandRules) {
    policies.executeCommand = {
      kind: "command-pattern",
      patterns: executeCommandRules,
    };
  }

  const webFetchPolicy = compileDomainToolPolicy(tools, "webFetch");
  if (webFetchPolicy) {
    policies.webFetch = webFetchPolicy;
  }

  const webSearchPolicy = compileDomainToolPolicy(tools, "webSearch");
  if (webSearchPolicy) {
    policies.webSearch = webSearchPolicy;
  }

  for (const toolName of [
    "readFile",
    "writeToFile",
    "applyDiff",
    "editNotebook",
  ] as const) {
    const policy = compilePathToolPolicy(tools, toolName);
    if (policy) {
      policies[toolName] = policy;
    }
  }

  return Object.keys(policies).length > 0 ? policies : undefined;
}

function compileDomainToolPolicy(
  tools: ToolSpecInput[] | undefined,
  toolName: "webFetch" | "webSearch",
) {
  if (!tools?.some((tool) => parseToolSpec(tool).name === toolName)) {
    return undefined;
  }

  const rules = getToolRules(tools, toolName);
  if (!rules) {
    return undefined;
  }

  return {
    kind: "domain-pattern",
    patterns: rules.map((rule) => parseDomainRule(toolName, rule)),
  } as const;
}

function parseDomainRule(toolName: "webFetch" | "webSearch", rule: string): string {
  const trimmedRule = rule.trim();
  const domainPrefix = "domain:";

  if (!trimmedRule.toLowerCase().startsWith(domainPrefix)) {
    throw new Error(
      `Invalid ${toolName} rule "${rule}". Use ${toolName}(domain:example.com).`,
    );
  }

  const domainPattern = normalizeDomainPattern(
    trimmedRule.slice(domainPrefix.length),
  );

  if (!domainPattern) {
    throw new Error(
      `Invalid ${toolName} rule "${rule}". Use ${toolName}(domain:example.com).`,
    );
  }

  return domainPattern;
}

function compilePathToolPolicy(
  tools: ToolSpecInput[] | undefined,
  toolName: "readFile" | "writeToFile" | "applyDiff" | "editNotebook",
) {
  if (!tools?.some((tool) => parseToolSpec(tool).name === toolName)) {
    return undefined;
  }

  const rules = getToolRules(tools, toolName);
  if (!rules) {
    return undefined;
  }

  return {
    kind: "path-pattern",
    patterns: rules,
  } as const;
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

export function validateExecuteCommandRules(
  command: string,
  allowedPatterns: string[],
): void {
  const segments = splitCommandSegments(command);

  for (const segment of segments) {
    const matched = allowedPatterns.some((pattern) =>
      matchSegmentPattern(segment, pattern),
    );

    if (!matched) {
      throw new Error(
        `Command is not allowed by the configured command rules. Allowed command patterns: ${allowedPatterns.join(", ")}`,
      );
    }
  }
}

export function validateCommandPatternPolicy(
  command: string,
  policy: { kind: "command-pattern"; patterns: string[] } | undefined,
): void {
  if (!policy) {
    return;
  }

  validateExecuteCommandRules(command, policy.patterns);
}

export function validateToolPolicy(
  toolName: string,
  input: unknown,
  policies: CompiledToolPolicies | undefined,
  options: { cwd: string },
): void {
  if (toolName === "executeCommand") {
    const command =
      typeof input === "object" && input !== null && "command" in input
        ? (input as { command?: unknown }).command
        : undefined;

    if (typeof command !== "string") {
      return;
    }

    validateCommandPatternPolicy(command, policies?.executeCommand);
    return;
  }

  if (toolName === "webFetch") {
    const rawUrl =
      typeof input === "object" && input !== null && "url" in input
        ? (input as { url?: unknown }).url
        : undefined;

    if (typeof rawUrl !== "string") {
      return;
    }

    validateDomainPatternPolicy(rawUrl, policies?.webFetch);
    return;
  }

  if (toolName === "webSearch") {
    const rawDomainFilters =
      typeof input === "object" && input !== null && "searchDomainFilter" in input
        ? (input as { searchDomainFilter?: unknown }).searchDomainFilter
        : undefined;

    validateWebSearchDomainPatternPolicy(rawDomainFilters, policies?.webSearch);
    return;
  }

  if (
    toolName === "readFile" ||
    toolName === "writeToFile" ||
    toolName === "applyDiff" ||
    toolName === "editNotebook"
  ) {
    const rawPath =
      typeof input === "object" && input !== null && "path" in input
        ? (input as { path?: unknown }).path
        : undefined;

    if (typeof rawPath !== "string") {
      return;
    }

    validatePathPatternPolicy(rawPath, policies?.[toolName], options);
  }
}

function validateWebSearchDomainPatternPolicy(
  rawDomainFilters: unknown,
  policy:
    | {
        kind: "domain-pattern";
        patterns: string[];
      }
    | undefined,
): void {
  if (!policy) {
    return;
  }

  if (rawDomainFilters == null) {
    return;
  }

  if (!Array.isArray(rawDomainFilters)) {
    throw new Error("searchDomainFilter must be an array of domain strings.");
  }

  if (rawDomainFilters.length === 0) {
    return;
  }

  for (const entry of rawDomainFilters) {
    if (typeof entry !== "string") {
      throw new Error("searchDomainFilter must be an array of domain strings.");
    }

    if (entry.trim().startsWith("-")) {
      throw new Error(
        "searchDomainFilter denylist entries are not allowed when webSearch domain rules are configured.",
      );
    }

    const normalizedDomain = normalizeDomainPattern(entry);
    if (!normalizedDomain) {
      throw new Error(
        "searchDomainFilter must contain non-empty domain patterns.",
      );
    }

    const matched = policy.patterns.some((pattern) =>
      minimatch(normalizedDomain, normalizeDomainPattern(pattern), {
        nocase: true,
      }),
    );

    if (!matched) {
      throw new Error(
        `searchDomainFilter contains disallowed domain "${entry}". Allowed domain patterns: ${policy.patterns.join(", ")}`,
      );
    }
  }
}

function validatePathPatternPolicy(
  inputPath: string,
  policy:
    | {
        kind: "path-pattern";
        patterns: string[];
      }
    | undefined,
  options: { cwd: string },
): void {
  if (!policy) {
    return;
  }

  const pathForRuleMatch = normalizePathForRuleMatch(inputPath, options);
  const matched = policy.patterns.some((pattern) => {
    const normalizedPattern = normalizePattern(pattern);
    return minimatch(pathForRuleMatch, normalizedPattern, {
      nocase: true,
    });
  });

  if (!matched) {
    throw new Error(
      `Path is not allowed by the configured path rules. Allowed path patterns: ${policy.patterns.join(", ")}`,
    );
  }
}

function validateDomainPatternPolicy(
  inputUrl: string,
  policy:
    | {
        kind: "domain-pattern";
        patterns: string[];
      }
    | undefined,
): void {
  if (!policy) {
    return;
  }

  let hostname: string;
  try {
    hostname = normalizeDomainPattern(new URL(inputUrl).hostname);
  } catch {
    return;
  }

  const matched = policy.patterns.some((pattern) =>
    minimatch(hostname, normalizeDomainPattern(pattern), {
      nocase: true,
    }),
  );

  if (!matched) {
    throw new Error(
      `URL domain is not allowed by the configured webFetch domain rules. Allowed domain patterns: ${policy.patterns.join(", ")}`,
    );
  }
}

function normalizePathForRuleMatch(
  inputPath: string,
  options: { cwd: string },
): string {
  if (inputPath.startsWith("pochi://")) {
    return normalizePattern(inputPath);
  }

  return normalizeWorkspacePathForRuleMatch(inputPath, options);
}

function normalizeWorkspacePathForRuleMatch(
  inputPath: string,
  options: { cwd: string },
): string {
  const resolvedPath = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(options.cwd, inputPath);
  const relativePath = path.relative(options.cwd, resolvedPath);
  const normalizedRelativePath = normalizePattern(relativePath);

  if (normalizedRelativePath === "" || normalizedRelativePath === ".") {
    return ".";
  }

  return normalizedRelativePath;
}

function normalizePattern(input: string): string {
  return input.replace(/\\/g, "/");
}

function normalizeDomainPattern(input: string): string {
  return input.trim().replace(/\.$/, "").toLowerCase();
}
