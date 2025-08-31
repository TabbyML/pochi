import type { LLMRequestData } from "@getpochi/livekit";
import type { PochiApiClient } from "@getpochi/common/pochi-api";
import type { Store } from "@livestore/livestore";

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
   * LLM configuration for sub-tasks (optional, used by newTask tool)
   */
  llm?: LLMRequestData;

  /**
   * API client for sub-tasks (optional, used by newTask tool)
   */
  apiClient?: PochiApiClient;

  /**
   * Store for sub-tasks (optional, used by newTask tool)
   */
  store?: Store;

  /**
   * Wait until function for sub-tasks (optional, used by newTask tool)
   */
  waitUntil?: (promise: Promise<unknown>) => void;
}
