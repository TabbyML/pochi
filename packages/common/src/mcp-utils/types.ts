import type { ToolCallOptions } from "ai";
import type {
  McpServerTransport,
  McpServerTransportHttp,
  McpServerTransportStdio,
} from "../configuration/index.js";
import type { McpToolStatus } from "../vscode-webui-bridge/index.js";

export function isStdioTransport(
  config: McpServerTransport,
): config is McpServerTransportStdio {
  return "command" in config;
}

export function isHttpTransport(
  config: McpServerTransport,
): config is McpServerTransportHttp {
  return "url" in config && !("command" in config);
}

export interface McpToolExecutable {
  execute?(args: unknown, options: ToolCallOptions): Promise<unknown>;
}

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
