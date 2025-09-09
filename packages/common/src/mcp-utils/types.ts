import type { ToolCallOptions } from "ai";
import type {
  McpServerTransport,
  McpServerTransportHttp,
  McpServerTransportStdio,
} from "../configuration/index.js";

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
