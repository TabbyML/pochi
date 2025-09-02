import type { PochiApiClient } from "@getpochi/common/pochi-api";
import type { LLMRequestData } from "@getpochi/livekit";
import type { Store } from "@livestore/livestore";
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
   * Function to create a sub-task runner (optional, used by newTask tool)
   */
  createSubTaskRunner?: (prompt: string, taskId: string) => TaskRunner;
}
