import type { McpHub } from "@getpochi/common/mcp-utils";
import type { ValidSkillFile } from "@getpochi/common/vscode-webui-bridge";
import type { CustomAgent } from "@getpochi/tools";
import type { TaskRunner } from "./task-runner";

export interface ToolCallOptions {
  /**
   * The path to the ripgrep executable.
   * This is used for searching files in the task runner.
   */
  rg: string;

  /**
   * Available custom agents for tools that support them (e.g., newTask)
   */
  customAgents?: CustomAgent[];

  /**
   * Available skills for tools that support them (e.g., skill)
   */
  skills?: ValidSkillFile[];

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
