import type { CustomAgent } from "@getpochi/tools";
import type { TaskRunner } from "./task-runner";

export interface ToolCallOptions {
  /**
   * The current working directory for the task runner.
   * This is used to determine where to read/write files and execute commands.
   * It should be an absolute path.
   */
  cwd: string;

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
   * Function to create a sub-task runner (optional, used by newTask tool)
   */
  createSubTaskRunner?: (
    taskId: string,
    customAgent?: CustomAgent,
  ) => TaskRunner;
}
