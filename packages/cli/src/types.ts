import type { McpHub } from "@getpochi/common/mcp-utils";
import type { CustomAgent, Skill } from "@getpochi/tools";
import type { AsyncSubTaskManager } from "./lib/async-subtask-manager";
import type { BackgroundJobManager } from "./lib/background-job-manager";
import type { FileSystem } from "./lib/file-system";
import type { TaskRunner } from "./task-runner";

export interface ToolCallOptions {
  /**
   * The path to the ripgrep executable.
   * This is used for searching files in the task runner.
   */
  rg: string;

  /**
   * The file system interface for reading and writing files.
   */
  fileSystem: FileSystem;

  /**
   * Available custom agents for tools that support them (e.g., newTask)
   */
  customAgents?: CustomAgent[];

  /**
   * Available skills for tools that support them (e.g., skill)
   */
  skills?: Skill[];

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

  /**
   * Manager for handling background jobs in the CLI
   */
  backgroundJobManager: BackgroundJobManager;

  /**
   * Manager for handling async sub-task results in the CLI
   */
  asyncSubTaskManager: AsyncSubTaskManager;
}
