import type { McpHub } from "@getpochi/common/mcp-utils";
import type { CustomAgent } from "@getpochi/tools";
import type { TaskRunner } from "./task-runner";

export interface ToolCallOptions {
  /**
   * The path to the ripgrep executable.
   * This is used for searching files in the task runner.
   * Can be null if ripgrep is not available.
   */
  rg: string;

  /**
   * Available custom agents for tools that support them (e.g., newTask)
   */
  customAgents?: CustomAgent[];

  /**
   * Function to create a sub-task runner (optional, used by newTask tool)
   */
  createSubTaskRunner?: (
    taskId: string,
    customAgent?: CustomAgent,
  ) => TaskRunner;

  /**
   * MCP Hub instance for accessing MCP server tools
   */
  mcpHub?: McpHub;
}
