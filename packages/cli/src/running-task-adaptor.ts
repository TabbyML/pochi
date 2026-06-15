import { getLogger } from "@getpochi/common";
import { AutoMemoryManager } from "@getpochi/common/auto-memory/node";
import type { McpHub } from "@getpochi/common/mcp-utils";
import { maybePersistToolResult } from "@getpochi/common/tool-utils";
import { resolveToolCallArgs } from "@getpochi/common/vscode-webui-bridge";
import {
  type BlobStore,
  type LLMRequestData,
  type LiveChatKitBackgroundTaskOptions,
  type UITools,
  processContentOutput,
} from "@getpochi/livekit";
import type { CustomAgent, Skill } from "@getpochi/tools";
import type { ToolUIPart } from "ai";
import type { CliBackgroundTaskFileStateCache } from "./background-task-file-state-cache";
import { BackgroundJobManager } from "./lib/background-job-manager";
import type { FileSystem } from "./lib/file-system";
import { readEnvironment } from "./lib/read-environment";
import { executeToolCall } from "./tools";
import type { ToolCallOptions } from "./types";

const logger = getLogger("CliRunningTaskAdaptor");
type RunningTaskAdaptor = NonNullable<
  LiveChatKitBackgroundTaskOptions["adaptor"]
>;

interface CliRunningTaskAdaptorOptions {
  blobStore: BlobStore;
  llm: LLMRequestData;
  cwd: string;
  rg: string;
  filesystem: FileSystem;
  customAgents?: CustomAgent[];
  skills?: Skill[];
  mcpHub?: McpHub;
  fileStateCache: CliBackgroundTaskFileStateCache;
  autoMemoryManager?: AutoMemoryManager;
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
  private readonly fileStateCache: CliBackgroundTaskFileStateCache;
  private readonly autoMemoryManager: AutoMemoryManager;
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
    this.fileStateCache = options.fileStateCache;
    this.autoMemoryManager =
      options.autoMemoryManager ?? new AutoMemoryManager();
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
      getEnvironment: async () =>
        readEnvironment({ cwd: context.cwd ?? this.cwd }),
      getAutoMemory: async () =>
        this.autoMemoryManager
          .readContext(context.cwd ?? this.cwd)
          .catch((error) => {
            logger.warn("Failed to read long-term memory context", error);
            return undefined;
          }),
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

  private createToolCallOptions(taskId: string): ToolCallOptions {
    return {
      rg: this.rg,
      fileSystem: this.filesystem,
      fileStateCache: this.fileStateCache.get(taskId),
      blobStore: this.blobStore,
      customAgents: this.customAgents,
      skills: this.skills,
      mcpHub: this.mcpHub,
      backgroundJobManager: this.getBackgroundJobManager(taskId),
    };
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
