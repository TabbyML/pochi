import { resolveModelFromId } from "@/lib/utils/resolve-model-from-id";
import { vscodeAutoMemoryManager, vscodeHost } from "@/lib/vscode";
import { type AutoMemoryContext, getLogger } from "@getpochi/common";
import type { McpStatus } from "@getpochi/common/mcp-utils";
import {
  type CustomAgentFile,
  type DisplayModel,
  type ExecuteCommandResult,
  type SkillFile,
  isValidCustomAgentFile,
  isValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import type { RunningTaskAdaptor } from "@getpochi/livekit";
import { ThreadAbortSignal } from "@quilted/threads";
import {
  type ThreadSignalSerialization,
  threadSignal,
} from "@quilted/threads/signals";
import { displayModelToLLM } from "../features/chat/lib/display-model-to-llm";
import { useSettingsStore } from "../features/settings/store";

const logger = getLogger("VscodeRunningTaskAdaptor");
const ModelListLoadTimeoutMs = 10_000;

export class VscodeRunningTaskAdaptor implements RunningTaskAdaptor {
  private modelList: DisplayModel[] = [];
  private mcpStatus: McpStatus = {
    connections: {},
    toolset: {},
    instructions: "",
  };
  private customAgents: CustomAgentFile[] = [];
  private skills: SkillFile[] = [];
  private effectiveContextWindow: number | undefined = undefined;
  private autoMemoryCache: Promise<AutoMemoryContext | undefined> | null = null;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly ready: Promise<void>;
  private disposed = false;

  constructor() {
    this.ready = this.init().catch((error) => {
      logger.warn("Failed to initialize background task adaptor", error);
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
  }

  waitUntilReady() {
    return this.ready;
  }

  getRequestGetters(context: { taskId: string; cwd: string | undefined }) {
    return {
      getLLM: () => {
        const llm = this.getLLM();
        if (!llm) {
          throw new Error("No model is available for the background task.");
        }
        return llm;
      },
      getEffectiveContextWindow: () => this.effectiveContextWindow,
      getEnvironment: () =>
        vscodeHost.readEnvironment({
          webviewKind: globalThis.POCHI_WEBVIEW_KIND,
          taskId: context.taskId,
        }),
      getAutoMemory: () => this.getAutoMemory(),
      getMcpInfo: () => ({
        toolset: this.mcpStatus.toolset,
        instructions: this.mcpStatus.instructions,
      }),
      getCustomAgents: () => this.customAgents.filter(isValidCustomAgentFile),
      getSkills: () => this.skills.filter(isValidSkillFile),
    };
  }

  async executeToolCall(
    args: Parameters<RunningTaskAdaptor["executeToolCall"]>[0],
  ) {
    const result = await vscodeHost.executeToolCall(args.toolName, args.input, {
      toolCallId: args.toolCallId,
      abortSignal: ThreadAbortSignal.serialize(args.abortSignal),
      toolPolicies: args.toolPolicies,
      storeId: args.storeId,
      taskId: args.taskId,
      fileStateCacheSourceTaskId: args.parentTaskId,
    });

    if (
      args.toolName === "executeCommand" &&
      typeof result === "object" &&
      result !== null &&
      "output" in result
    ) {
      return waitForExecuteCommandOutput(
        result.output as ThreadSignalSerialization<ExecuteCommandResult>,
        args.abortSignal,
      );
    }

    return result;
  }

  onTaskError(taskId: string, error: Error) {
    logger.warn({ taskId, error }, "Task execution failed");
  }

  private async init() {
    await Promise.all([
      this.initModelList(),
      this.initMcpStatus(),
      this.initCustomAgents(),
      this.initSkills(),
      this.initEffectiveContextWindow(),
    ]);
  }

  private async initEffectiveContextWindow() {
    const signal = threadSignal(await vscodeHost.readEffectiveContextWindow());
    this.effectiveContextWindow = signal.value;
    this.addUnsubscriber(
      signal.subscribe((effectiveContextWindow) => {
        this.effectiveContextWindow = effectiveContextWindow;
      }),
    );
  }

  private async initModelList() {
    const result = await vscodeHost.readModelList();
    const modelListSignal = threadSignal(result.modelList);
    const isLoadingSignal = threadSignal(result.isLoading);

    this.modelList = modelListSignal.value;
    this.addUnsubscriber(
      modelListSignal.subscribe((modelList) => {
        this.modelList = modelList;
      }),
    );

    if (isLoadingSignal.value) {
      await waitForSignal(
        isLoadingSignal,
        (isLoading) => !isLoading,
        ModelListLoadTimeoutMs,
      );
    }
  }

  private async initMcpStatus() {
    const signal = threadSignal(await vscodeHost.readMcpStatus());
    this.mcpStatus = signal.value;
    this.addUnsubscriber(
      signal.subscribe((mcpStatus) => {
        this.mcpStatus = mcpStatus;
      }),
    );
  }

  private async initCustomAgents() {
    const signal = threadSignal(await vscodeHost.readCustomAgents());
    this.customAgents = signal.value;
    this.addUnsubscriber(
      signal.subscribe((customAgents) => {
        this.customAgents = customAgents;
      }),
    );
  }

  private async initSkills() {
    const signal = threadSignal(await vscodeHost.readSkills());
    this.skills = signal.value;
    this.addUnsubscriber(
      signal.subscribe((skills) => {
        this.skills = skills;
      }),
    );
  }

  private addUnsubscriber(unsubscribe: () => void) {
    if (this.disposed) {
      unsubscribe();
      return;
    }
    this.unsubscribers.push(unsubscribe);
  }

  private getLLM() {
    const selectedModelId = useSettingsStore.getState().selectedModel?.id;
    const selectedModel =
      resolveModelFromId(selectedModelId, this.modelList) ??
      this.modelList.at(0);

    return selectedModel ? displayModelToLLM(selectedModel) : undefined;
  }

  private getAutoMemory() {
    if (this.autoMemoryCache) return this.autoMemoryCache;

    const pending = vscodeAutoMemoryManager.readContext();
    this.autoMemoryCache = pending;
    pending.catch(() => {
      if (this.autoMemoryCache === pending) {
        this.autoMemoryCache = null;
      }
    });
    return pending;
  }
}

function waitForExecuteCommandOutput(
  output: ThreadSignalSerialization<ExecuteCommandResult>,
  abortSignal: AbortSignal,
) {
  const outputSignal = threadSignal(output);

  return new Promise<Record<string, unknown>>((resolve) => {
    let resolved = false;
    let unsubscribe = () => {};

    const finalize = (
      value: ExecuteCommandResult,
      reason: "completed" | "aborted",
    ) => {
      if (resolved) return;
      resolved = true;
      unsubscribe();
      abortSignal.removeEventListener("abort", onAbort);

      const result: Record<string, unknown> = {
        output: value.content,
        isTruncated: value.isTruncated ?? false,
      };
      if (value.error) {
        result.error = value.error;
      } else if (reason === "aborted") {
        result.error = "Aborted by background task runner";
      }
      resolve(result);
    };

    const onAbort = () => finalize(outputSignal.value, "aborted");

    unsubscribe = outputSignal.subscribe((value) => {
      if (value.status === "completed") {
        finalize(value, "completed");
      }
    });

    if (outputSignal.value.status === "completed") {
      finalize(outputSignal.value, "completed");
    } else if (abortSignal.aborted) {
      finalize(outputSignal.value, "aborted");
    } else {
      abortSignal.addEventListener("abort", onAbort);
    }
  });
}

function waitForSignal<T>(
  signal: {
    value: T;
    subscribe: (callback: (value: T) => void) => () => void;
  },
  predicate: (value: T) => boolean,
  timeoutMs: number,
) {
  if (predicate(signal.value)) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve();
    }, timeoutMs);

    const unsubscribe = signal.subscribe((value) => {
      if (predicate(value)) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });
}
