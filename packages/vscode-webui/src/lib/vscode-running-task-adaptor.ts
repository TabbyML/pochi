import { resolveModelFromId } from "@/lib/utils/resolve-model-from-id";
import { vscodeAutoMemoryManager, vscodeHost } from "@/lib/vscode";
import {
  type AutoMemoryContext,
  formatSubagentWorktreeNote,
  getLogger,
} from "@getpochi/common";
import type { McpStatus } from "@getpochi/common/mcp-utils";
import { decodeStoreId } from "@getpochi/common/store-id-utils";
import {
  type BrowserAgentSettings,
  type BuiltinSubAgentInfo,
  type CustomAgentFile,
  type DisplayModel,
  type ExecuteCommandResult,
  type SkillFile,
  isValidCustomAgentFile,
  isValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import {
  type BackgroundCommandAdaptor,
  type LLMRequestData,
  type LiveKitStore,
  type Message,
  type RunningTaskAdaptor,
  catalog,
  processContentOutput,
} from "@getpochi/livekit";
import { ThreadAbortSignal } from "@quilted/threads";
import {
  type ThreadSignalSerialization,
  threadSignal,
} from "@quilted/threads/signals";
import { displayModelToLLM } from "../features/chat/lib/display-model-to-llm";
import { useSettingsStore } from "../features/settings/store";
import { browserSessionManager } from "./browser-session-manager";
import { blobStore } from "./remote-blob-store";

const logger = getLogger("VscodeRunningTaskAdaptor");
const ModelListLoadTimeoutMs = 10_000;

export class VscodeRunningTaskAdaptor implements RunningTaskAdaptor {
  readonly homeDir = globalThis.POCHI_HOME_DIR;
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
  private readonly taskLLMs = new Map<string, LLMRequestData>();
  private browserSettings:
    | Promise<{ readonly value: BrowserAgentSettings }>
    | undefined;
  private disposed = false;

  /** `store` is needed to save browser recordings of background tasks. */
  constructor(private readonly store?: LiveKitStore) {
    this.ready = this.init().catch((error) => {
      logger.warn("Failed to initialize background task adaptor", error);
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.taskLLMs.clear();
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
  }

  waitUntilReady() {
    return this.ready;
  }

  readonly commandAdaptor: BackgroundCommandAdaptor = {
    kill: async (id) => (await vscodeHost.readBackgroundCommands()).close(id),
    observeCommands: async (onChange) => {
      const commands = await vscodeHost.readBackgroundCommands();
      const controller = new AbortController();
      try {
        const running = await connectSignal(
          commands.backgroundCommands,
          controller.signal,
        );
        const unsubscribe = running.subscribe(onChange);
        onChange(running.value);
        return {
          dispose: () => {
            controller.abort();
            unsubscribe();
          },
        };
      } catch (error) {
        controller.abort();
        throw error;
      }
    },
    observeNotifications: async (taskId, onChange) => {
      const notifications =
        await vscodeHost.readBackgroundJobNotifications(taskId);
      const controller = new AbortController();
      try {
        const pending = await connectSignal(
          notifications.notifications,
          controller.signal,
        );
        const unsubscribe = pending.subscribe(onChange);
        onChange(pending.value);
        return {
          dispose: () => {
            controller.abort();
            unsubscribe();
          },
          acknowledge: notifications.acknowledge,
          snapshotPending: notifications.snapshotPending,
        };
      } catch (error) {
        controller.abort();
        throw error;
      }
    },
  };

  getRequestGetters(
    context: Parameters<RunningTaskAdaptor["getRequestGetters"]>[0],
  ) {
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
          cwd: context.cwd,
          omitCustomRules: context.omitCustomRules,
        }),
      getAutoMemory: () => this.getAutoMemory(),
      getMcpInfo: () => ({
        toolset: this.mcpStatus.toolset,
        instructions: this.mcpStatus.instructions,
      }),
      getCustomAgents: () => this.customAgents.filter(isValidCustomAgentFile),
      getSkills: () => this.skills.filter(isValidSkillFile),
      getSubagentWorktreePath: (taskId: string) =>
        vscodeHost.readSubagentWorktreePath(taskId),
    };
  }

  async resolveTaskLLM(
    context: Parameters<NonNullable<RunningTaskAdaptor["resolveTaskLLM"]>>[0],
  ) {
    const llm = this.resolveAgentLLM(context.taskState.agentType);
    if (llm) {
      this.taskLLMs.set(context.taskId, llm);
    } else {
      this.taskLLMs.delete(context.taskId);
    }
    return llm;
  }

  private resolveAgentLLM(agentType: string | undefined) {
    if (!agentType) {
      return undefined;
    }
    const agent = this.customAgents
      .filter(isValidCustomAgentFile)
      .find((a) => a.name === agentType);
    if (!agent?.model) return undefined;

    const resolvedModel = resolveModelFromId(agent.model, this.modelList);
    if (resolvedModel) return displayModelToLLM(resolvedModel);

    if (agent.isBuiltIn) {
      // Built-in special models are currently served by the Pochi vendor.
      const credentialSource = this.modelList.find(
        (model) => model.type === "vendor" && model.vendorId === "pochi",
      );
      if (credentialSource?.type === "vendor") {
        return displayModelToLLM({
          type: "vendor",
          id: agent.model,
          name: agent.model,
          vendorId: "pochi",
          modelId: agent.model,
          options: {},
          getCredentials: credentialSource.getCredentials,
        });
      }
    }

    logger.warn(
      `Model "${agent.model}" for agent ${agent.name} not found; falling back to the selected model.`,
    );
    return undefined;
  }

  async executeToolCall(
    args: Parameters<RunningTaskAdaptor["executeToolCall"]>[0],
  ) {
    const llm = this.taskLLMs.get(args.taskId) ?? this.getLLM();
    const builtinSubAgentInfo: BuiltinSubAgentInfo | undefined =
      args.agentType === "browser"
        ? { type: "browser", sessionId: args.taskId }
        : undefined;
    if (builtinSubAgentInfo && args.toolName === "executeCommand") {
      await this.registerBrowserSession(
        args.taskId,
        args.storeId,
        args.abortSignal,
      );
      args.abortSignal.throwIfAborted();
      if (this.disposed) {
        throw new Error("Background task adaptor is disposed.");
      }
    }
    let result = await vscodeHost.executeToolCall(args.toolName, args.input, {
      toolCallId: args.toolCallId,
      abortSignal: ThreadAbortSignal.serialize(args.abortSignal),
      contentType: llm?.contentType,
      builtinSubAgentInfo,
      toolPolicies: args.toolPolicies,
      storeId: args.storeId,
      taskId: args.taskId,
      allowBackground: args.allowBackground,
      cwd: args.cwd,
    });

    if (
      args.toolName === "executeCommand" &&
      typeof result === "object" &&
      result !== null &&
      "streamingOutput" in result
    ) {
      result = await waitForExecuteCommandOutput(
        result.streamingOutput as ThreadSignalSerialization<ExecuteCommandResult>,
        args.abortSignal,
      );
    }

    return processContentOutput(blobStore, result, args.abortSignal);
  }

  onTaskError(taskId: string, error: Error) {
    logger.warn({ taskId, error }, "Task execution failed");
  }

  async onTaskFinished(taskId: string) {
    await this.releaseBrowserSession(taskId);
    const finalized = await vscodeHost.finalizeSubagentWorktree(taskId);
    return (
      finalized && formatSubagentWorktreeNote(finalized, finalized.removed)
    );
  }

  /** Starts the live preview and recording of a background browser task. */
  private async registerBrowserSession(
    taskId: string,
    storeId: string,
    abortSignal: AbortSignal,
  ) {
    if (
      this.disposed ||
      abortSignal.aborted ||
      browserSessionManager.isRegistered(taskId)
    ) {
      return;
    }
    try {
      this.browserSettings ??= vscodeHost
        .readBrowserAgentSettings()
        .then(({ browserSettings }) => threadSignal(browserSettings));
      const settings = (await this.browserSettings).value;
      if (this.disposed || abortSignal.aborted) return;
      await browserSessionManager.registerSession(
        taskId,
        decodeStoreId(storeId).taskId,
        {
          viewport:
            settings.runtime.mode === "managed"
              ? settings.managedBrowser.viewport
              : undefined,
        },
      );
    } catch (error) {
      this.browserSettings = undefined;
      logger.warn({ taskId, error }, "Failed to register browser session");
    }
  }

  /**
   * Saves the recording under the parent's newTask tool call, as the
   * foreground flow does, and closes the browser session.
   */
  private async releaseBrowserSession(taskId: string) {
    const { store } = this;
    if (!store) return;
    const parentId = store.query(
      catalog.queries.makeTaskQuery(taskId),
    )?.parentId;
    if (!parentId) return;
    const invocation = store
      .query(catalog.queries.makeMessagesQuery(parentId))
      .flatMap((row) => (row.data as Message).parts)
      .find(
        (part) =>
          part.type === "tool-newTask" &&
          part.state !== "input-streaming" &&
          part.input?._meta?.uid === taskId,
      );
    if (
      invocation?.type !== "tool-newTask" ||
      invocation.state === "input-streaming" ||
      invocation.input?.agentType !== "browser"
    ) {
      return;
    }
    await browserSessionManager.unregisterSession(
      taskId,
      invocation.toolCallId,
      store,
    );
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
      if (value._meta) {
        result._meta = value._meta;
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

async function connectSignal<T>(
  serialized: ThreadSignalSerialization<T>,
  abortSignal: AbortSignal,
) {
  let started: unknown;
  const connected = threadSignal(
    {
      ...serialized,
      start(...args) {
        started = serialized.start(...args);
      },
    },
    { signal: abortSignal },
  );
  await started;
  return connected;
}
