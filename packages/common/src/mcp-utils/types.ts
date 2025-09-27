import type { McpTool } from "@getpochi/tools";
import type { ToolCallOptions } from "ai";
import type {
  McpServerTransport,
  McpServerTransportHttp,
  McpServerTransportStdio,
} from "../configuration/index.js";

export interface McpServerConnection {
  status: "stopped" | "starting" | "ready" | "error";
  error: string | undefined;
  kind?: "vendor";
  tools: {
    [toolName: string]: McpToolStatus;
  };
}

export interface McpServerConnectionExecutable extends McpServerConnection {
  tools: {
    [toolName: string]: McpToolStatus & McpToolExecutable;
  };
}

export interface McpToolStatus extends McpTool {
  disabled: boolean;
}

export type McpStatus = {
  /**
   * Connection status for each MCP server.
   */
  connections: {
    [serverName: string]: McpServerConnection;
  };
  /**
   * Reduced available toolset from all MCP servers, disabled tools are excluded.
   */
  toolset: {
    [toolName: string]: McpTool;
  };

  instructions: string;
};

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
  execute(args: unknown, options: ToolCallOptions): Promise<unknown>;
}
