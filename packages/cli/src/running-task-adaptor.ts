import { getLogger } from "@getpochi/common";
import { AutoMemoryManager } from "@getpochi/common/auto-memory/node";
import { pochiConfig } from "@getpochi/common/configuration";
import type { McpHub } from "@getpochi/common/mcp-utils";
import {
  FileStateCache,
  maybePersistToolResult,
} from "@getpochi/common/tool-utils";
import { resolveToolCallArgs } from "@getpochi/common/vscode-webui-bridge";
import {
  type BlobStore,
  type LLMRequestData,
  type RunningTaskAdaptor,
  type UITools,
  processContentOutput,
} from "@getpochi/livekit";
import type { CustomAgent, Skill } from "@getpochi/tools";
import type { ToolUIPart } from "ai";
import { BackgroundJobManager } from "./lib/background-job-manager";
import type { FileSystem } from "./lib/file-system";
import { readEnvironment } from "./lib/read-environment";
import { executeToolCall } from "./tools";
import type { ToolCallOptions } from "./types";

const logger = getLogger("CliRunningTaskAdaptor");

/**
 * Options required to initialize the CliRunningTaskAdaptor.
 */
interface CliRunningTaskAdaptorOptions {
  /** Storage bucket for managing large files and media content */
  blobStore: BlobStore;
  /** LLM request configuration and metadata */
  llm: LLMRequestData;
  /** Current working directory for the task execution */
  cwd: string;
  /** Path to the ripgrep binary used for fast file searches */
  rg: string;
  /** File system abstraction for reading and writing files */
  filesystem: FileSystem;
  /** List of registered custom agents available to the runner */
  customAgents?: CustomAgent[];
  /** List of registered custom skills available to the runner */
  skills?: Skill[];
  /** MCP (Model Context Protocol) hub for managing external tools and server integrations */
  mcpHub?: McpHub;
  /** ID of the parent task, if this adaptor is running a sub-task */
  parentTaskId?: string;
  /** File state cache of the parent task, used to seed the sub-task cache */
  parentFileStateCache?: FileStateCache;
  /** Manager responsible for loading and saving long-term project/user memory */
  autoMemoryManager?: AutoMemoryManager;
  /** Flag to determine if project-level long-term memory is enabled */
  projectMemoryEnabled?: boolean;
}

/**
 * CliRunningTaskAdaptor implements the RunningTaskAdaptor interface from @getpochi/livekit.
 * It coordinates task execution context, environment variables, custom agents, skills,
 * tool invocation routing, file state caching, and active background jobs within the CLI environment.
 */
export class CliRunningTaskAdaptor implements RunningTaskAdaptor {
  /** Storage bucket for managing large files and media content */
  private readonly blobStore: BlobStore;

  /** LLM request configuration and metadata */
  private readonly llm: LLMRequestData;

  /** Current working directory for the task execution */
  private readonly cwd: string;

  /** Path to the ripgrep binary used for fast file searches */
  private readonly rg: string;

  /** File system abstraction for reading and writing files */
  private readonly filesystem: FileSystem;

  /** List of registered custom agents available to the runner */
  private readonly customAgents: CustomAgent[] | undefined;

  /** List of registered custom skills available to the runner */
  private readonly skills: Skill[] | undefined;

  /** MCP (Model Context Protocol) hub for managing external tools and server integrations */
  private readonly mcpHub: McpHub | undefined;

  /** ID of the parent task, if this adaptor is running a sub-task */
  private readonly parentTaskId: string | undefined;

  /** File state cache of the parent task, used to seed the sub-task cache */
  private readonly parentFileStateCache: FileStateCache | undefined;

  /** Maps task IDs to their corresponding FileStateCache to track changes per task */
  private readonly fileStateCaches = new Map<string, FileStateCache>();

  /** Manager responsible for loading and saving long-term project/user memory */
  private readonly autoMemoryManager: AutoMemoryManager;

  /** Flag to determine if project-level long-term memory is enabled */
  private readonly projectMemoryEnabled: boolean;

  /** Maps task IDs to their corresponding BackgroundJobManager to isolate background processes */
  private readonly backgroundJobManagers = new Map<
    string,
    BackgroundJobManager
  >();

  /**
   * Constructs a new CliRunningTaskAdaptor instance.
   *
   * @param options Configuration options for initializing the adaptor.
   */
  constructor(options: CliRunningTaskAdaptorOptions) {
    this.blobStore = options.blobStore;
    this.llm = options.llm;
    this.cwd = options.cwd;
    this.rg = options.rg;
    this.filesystem = options.filesystem;
    this.customAgents = options.customAgents;
    this.skills = options.skills;
    this.mcpHub = options.mcpHub;
    this.parentTaskId = options.parentTaskId;
    this.parentFileStateCache = options.parentFileStateCache;
    this.autoMemoryManager =
      options.autoMemoryManager ?? new AutoMemoryManager();
    this.projectMemoryEnabled = options.projectMemoryEnabled ?? true;
  }

  /**
   * Cleans up resources allocated by this adaptor, particularly killing all
   * active background jobs spawned by running tasks.
   */
  dispose() {
    for (const manager of this.backgroundJobManagers.values()) {
      manager.killAll();
    }
    this.backgroundJobManagers.clear();
  }

  /**
   * Retrieves getters for various pieces of request-scoped context such as LLM config,
   * environment variables, long-term memory, MCP metadata, custom agents, and skills.
   *
   * @param context Context containing the current taskId and optional working directory override.
   */
  getRequestGetters(context: { taskId: string; cwd: string | undefined }) {
    return {
      getLLM: () => this.llm,
      getEffectiveContextWindow: () => pochiConfig.value.effectiveContextWindow,
      getEnvironment: async () =>
        readEnvironment({ cwd: context.cwd ?? this.cwd }),
      ...(this.projectMemoryEnabled
        ? {
            getAutoMemory: async () =>
              this.autoMemoryManager
                .readContext(context.cwd ?? this.cwd)
                .catch((error) => {
                  logger.warn("Failed to read long-term memory context", error);
                  return undefined;
                }),
          }
        : {}),
      getMcpInfo: () => {
        const status = this.mcpHub?.status.value;
        return {
          toolset: status?.toolset || {},
          instructions: status?.instructions || "",
        };
      },
      getCustomAgents: () => this.customAgents,
      getSkills: () => this.skills,
    };
  }

  /**
   * Executes a tool call requested by an agent. If the tool call is from a sub-task,
   * it propagates the file state cache from the parent task.
   *
   * @param args Arguments specifying the tool call details (name, input, taskId, etc.).
   */
  async executeToolCall(
    args: Parameters<RunningTaskAdaptor["executeToolCall"]>[0],
  ) {
    // Propagate the parent's file state cache if this task is a newly spawned sub-task.
    if (args.parentTaskId) {
      this.copyFileStateCacheIfAbsent(args.parentTaskId, args.taskId);
    }

    const tool = {
      type: `tool-${args.toolName}`,
      toolCallId: args.toolCallId,
      state: "input-available",
      input: resolveToolCallArgs(args.input, args.storeId),
    } as ToolUIPart<UITools>;

    // Execute the tool call and process any generated content (e.g. converting HTML to markdown)
    const result = await processContentOutput(
      this.blobStore,
      await executeToolCall(
        tool,
        this.createToolCallOptions(args.taskId),
        this.cwd,
        args.abortSignal,
        this.llm.contentType,
      ),
    );

    // Persist the tool execution result for the task history
    return maybePersistToolResult(
      args.toolName,
      args.toolCallId,
      args.taskId,
      result,
    );
  }

  /**
   * Handles errors encountered during task execution.
   */
  onTaskError(taskId: string, error: Error) {
    logger.warn({ taskId, error }, "Task execution failed");
  }

  /**
   * Clears the file state cache for a specific task, marking all cached files as written.
   */
  clearFileStateCache(taskId: string) {
    this.fileStateCaches.get(taskId)?.markAllAsWritten();
  }

  /**
   * Creates the options configuration required to run a specific tool call.
   *
   * @param taskId The ID of the task for which the tool is being executed.
   */
  private createToolCallOptions(taskId: string): ToolCallOptions {
    return {
      rg: this.rg,
      fileSystem: this.filesystem,
      fileStateCache: this.getFileStateCache(taskId),
      blobStore: this.blobStore,
      customAgents: this.customAgents,
      skills: this.skills,
      mcpHub: this.mcpHub,
      backgroundJobManager: this.getBackgroundJobManager(taskId),
    };
  }

  /**
   * Copies the file state cache from a source task to a target task if the target
   * cache does not already exist or is empty. This is crucial for passing file modifications
   * and state context down to child sub-tasks.
   *
   * @param sourceTaskId The ID of the parent or source task.
   * @param targetTaskId The ID of the child or target task.
   */
  private copyFileStateCacheIfAbsent(
    sourceTaskId: string,
    targetTaskId: string,
  ) {
    const existingTarget = this.fileStateCaches.get(targetTaskId);
    if (existingTarget && existingTarget.size > 0) {
      return;
    }

    const source =
      this.fileStateCaches.get(sourceTaskId) ??
      (sourceTaskId === this.parentTaskId
        ? this.parentFileStateCache
        : undefined);
    const target = new FileStateCache();
    if (source) {
      for (const [key, value] of source) {
        target.set(key, { ...value });
      }
    }
    this.fileStateCaches.set(targetTaskId, target);
  }

  /**
   * Retrieves or lazily initializes the FileStateCache for a given task.
   */
  private getFileStateCache(taskId: string) {
    let cache = this.fileStateCaches.get(taskId);
    if (!cache) {
      cache = new FileStateCache();
      this.fileStateCaches.set(taskId, cache);
    }
    return cache;
  }

  /**
   * Retrieves or lazily initializes the BackgroundJobManager for a given task.
   */
  private getBackgroundJobManager(taskId: string) {
    let manager = this.backgroundJobManagers.get(taskId);
    if (!manager) {
      manager = new BackgroundJobManager();
      this.backgroundJobManagers.set(taskId, manager);
    }
    return manager;
  }
}
