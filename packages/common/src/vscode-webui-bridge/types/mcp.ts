import type { McpTool } from "@getpochi/tools";

export interface McpConnection {
  status: "stopped" | "starting" | "ready" | "error";
  error: string | undefined;
  tools: {
    [toolName: string]: McpToolStatus;
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
    [serverName: string]: McpConnection;
  };
  /**
   * Reduced available toolset from all MCP servers, disabled tools are excluded.
   */
  toolset: {
    [toolName: string]: McpTool;
  };

  instructions: string;
};
