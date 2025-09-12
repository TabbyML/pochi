import type { McpToolStatus } from "@getpochi/common/vscode-webui-bridge";
import type { McpToolExecutable } from "@getpochi/common/mcp-utils";
import type { ToolCallOptions } from "ai";

export function isExecutable(
  tool: McpToolExecutable,
): tool is McpToolExecutable & {
  execute: (args: unknown, options?: ToolCallOptions) => Promise<unknown>;
} {
  return typeof tool?.execute === "function";
}

export function omitDisabled<T extends McpToolStatus>(
  tool: T,
): Omit<T, "disabled"> {
  const { disabled, ...rest } = tool;
  return rest;
}
