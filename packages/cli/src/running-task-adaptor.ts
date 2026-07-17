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

interface CliRunningTaskAdaptorOptions {
  blobStore: BlobStore;
  llm: LLMRequestData;
  cwd: string;
  rg: string;
  filesystem: FileSystem;
  customAgents?: CustomAgent[];
  skills?: Skill[];
  mcpHub?: McpHub;
  parentTaskId?: string;
  parentFileStateCache?: FileStateCache;
  autoMemoryManager?: AutoMemoryManager;
  projectMemoryEnabled?: boolean;
}

export class CliRunningTaskAdaptor implements RunningTaskAdaptor {
  private readonly blobStore: BlobStore;
  private readonly llm: LLMRequestData;
  private readonly cwd: string;
  private readonly rg: string;
  private readonly filesystem: FileSystem;
  private readonly customAgents: CustomAgent[] | undefined;
  private readonly skills: Skill[] | undefined;
  private readonly mcpHub: McpHub | undefined;
  private readonly parentTaskId: string | undefined;
  private readonly parentFileStateCache: FileStateCache | undefined;
  private readonly fileStateCaches = new Map<string, FileStateCache>();
  private readonly autoMemoryManager: AutoMemoryManager;
  private readonly projectMemoryEnabled: boolean;
  private readonly backgroundJobManagers = new Map<
    string,
    BackgroundJobManager
  >();

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

  dispose() {
    for (const manager of this.backgroundJobManagers.values()) {
      manager.killAll();
    }
    this.backgroundJobManagers.clear();
  }

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

  async executeToolCall(
    args: Parameters<RunningTaskAdaptor["executeToolCall"]>[0],
  ) {
    if (args.parentTaskId) {
      this.copyFileStateCacheIfAbsent(args.parentTaskId, args.taskId);
    }

    const tool = {
      type: `tool-${args.toolName}`,
      toolCallId: args.toolCallId,
      state: "input-available",
      input: resolveToolCallArgs(args.input, args.storeId),
    } as ToolUIPart<UITools>;

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

    return maybePersistToolResult(
      args.toolName,
      args.toolCallId,
      args.taskId,
      result,
    );
  }

  onTaskError(taskId: string, error: Error) {
    logger.warn({ taskId, error }, "Task execution failed");
  }

  clearFileStateCache(taskId: string) {
    this.fileStateCaches.get(taskId)?.markAllAsWritten();
  }

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

  private getFileStateCache(taskId: string) {
    let cache = this.fileStateCaches.get(taskId);
    if (!cache) {
      cache = new FileStateCache();
      this.fileStateCaches.set(taskId, cache);
    }
    return cache;
  }

  private getBackgroundJobManager(taskId: string) {
    let manager = this.backgroundJobManagers.get(taskId);
    if (!manager) {
      manager = new BackgroundJobManager();
      this.backgroundJobManagers.set(taskId, manager);
    }
    return manager;
  }
}
