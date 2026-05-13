import type { BrowserSessionStore } from "@getpochi/common/browser";
import type { McpHub } from "@getpochi/common/mcp-utils";
import type { FileStateCache } from "@getpochi/common/tool-utils";
import type { BlobStore } from "@getpochi/livekit";
import type { CustomAgent, Skill } from "@getpochi/tools";
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
   * LRU cache tracking file content the model has "seen".
   * Used for read deduplication and edit/write staleness guards.
   */
  fileStateCache: FileStateCache;

  /**
   * Blob store for local file access
   */
  blobStore: BlobStore;

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
    overrideOptions?: CreateSubTaskRunnerOverrideOptions,
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
   * Store for managing browser sessions
   */
  browserSessionStore?: BrowserSessionStore;
}

export interface CreateSubTaskRunnerOverrideOptions {
  customAgent?: CustomAgent;
  maxSteps?: number;
  maxRetries?: number;
}
