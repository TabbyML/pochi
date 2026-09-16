import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import {
  type BackgroundJobEvent,
  type BackgroundJobTerminalEvent,
  type MonitorEventEnvelope,
  type MonitorJobOptions,
  MonitorWatcher,
  createBackgroundJobNotification,
  getLogger,
} from "@getpochi/common";
import { AutoMemoryManager } from "@getpochi/common/auto-memory/node";
import { pochiConfig } from "@getpochi/common/configuration";
import { getTerminalEnv } from "@getpochi/common/env-utils";
import type { McpHub } from "@getpochi/common/mcp-utils";
import {
  BackgroundJobOutputFile,
  FileStateCache,
  PlainOutputSanitizer,
  createBackgroundJobId,
  getBackgroundJobOutputPath,
  getShellPath,
  maybePersistToolResult,
} from "@getpochi/common/tool-utils";
import {
  type ValidCustomAgentFile,
  resolveToolCallArgs,
} from "@getpochi/common/vscode-webui-bridge";
import {
  type BackgroundCommandAdaptor,
  BackgroundJobManager,
  type BlobStore,
  type LLMRequestData,
  type LiveKitStore,
  type RunningTaskAdaptor,
  type UITools,
  processContentOutput,
} from "@getpochi/livekit";
import type { Skill } from "@getpochi/tools";
import type { ToolUIPart } from "ai";
import type { FileSystem } from "./lib/file-system";
import type {
  BackgroundJobInitialOutput,
  BackgroundJobInitialOutputStream,
} from "./lib/foreground-output-capture";
import { readEnvironment } from "./lib/read-environment";
import { executeToolCall } from "./tools";
import type { ToolCallOptions } from "./types";

interface BackgroundCommand {
  taskId: string;
  id: string;
  command: string;
  process: ChildProcess;
  outputFile: string;
  outputWriter: BackgroundJobOutputFile;
  status: "running" | "completed" | "failed" | "stopped";
  stopRequested?: boolean;
  finalizing?: boolean;
  disposeAbort?: () => void;
  monitor?: {
    description: string;
    watcher: MonitorWatcher;
    endReason?: string;
    killTimer?: ReturnType<typeof setTimeout>;
  };
}

const logger = getLogger("CliRunningTaskAdaptor");

interface CliRunningTaskAdaptorOptions {
  commandOutputDir?: string;
  store: LiveKitStore;
  blobStore: BlobStore;
  llm: LLMRequestData;
  cwd: string;
  rg: string;
  filesystem: FileSystem;
  customAgents?: ValidCustomAgentFile[];
  skills?: Skill[];
  mcpHub?: McpHub;
  parentTaskId?: string;
  parentFileStateCache?: FileStateCache;
  autoMemoryManager?: AutoMemoryManager;
  projectMemoryEnabled?: boolean;
  resolveSubTaskLLM?: (
    customAgent: ValidCustomAgentFile,
  ) => Promise<LLMRequestData | undefined>;
}

export class CliRunningTaskAdaptor implements RunningTaskAdaptor {
  private readonly blobStore: BlobStore;
  private readonly llm: LLMRequestData;
  private readonly cwd: string;
  private readonly rg: string;
  private readonly filesystem: FileSystem;
  private readonly customAgents: ValidCustomAgentFile[] | undefined;
  private readonly skills: Skill[] | undefined;
  private readonly mcpHub: McpHub | undefined;
  private readonly parentTaskId: string | undefined;
  private readonly parentFileStateCache: FileStateCache | undefined;
  private readonly fileStateCaches = new Map<string, FileStateCache>();
  private readonly autoMemoryManager: AutoMemoryManager;
  private readonly projectMemoryEnabled: boolean;
  private readonly resolveSubTaskLLM: CliRunningTaskAdaptorOptions["resolveSubTaskLLM"];
  private readonly taskLLMs = new Map<string, LLMRequestData>();

  private readonly commands: Map<string, BackgroundCommand> = new Map();

  private readonly commandListeners = new Set<
    Parameters<BackgroundCommandAdaptor["observeCommands"]>[0]
  >();
  private readonly notificationListeners = new Map<string, Set<() => void>>();
  private readonly notifications = new Map<
    string,
    { taskId: string; notification: BackgroundJobEvent }
  >();
  readonly commandAdaptor: BackgroundCommandAdaptor = {
    kill: async (id) => {
      if (!this.killBackgroundCommand(id)) {
        throw new Error(`Failed to stop background command "${id}".`);
      }
    },
    observeCommands: async (onChange) => {
      this.commandListeners.add(onChange);
      onChange(this.runningCommands());
      return {
        dispose: () => {
          this.commandListeners.delete(onChange);
        },
      };
    },
    observeNotifications: async (taskId, onChange) => {
      const update = () =>
        onChange(
          [...this.notifications.values()]
            .filter((entry) => entry.taskId === taskId)
            .map((entry) => entry.notification),
        );
      let listeners = this.notificationListeners.get(taskId);
      if (!listeners) {
        listeners = new Set();
        this.notificationListeners.set(taskId, listeners);
      }
      listeners.add(update);
      update();
      return {
        dispose: () => {
          listeners.delete(update);
          if (!listeners.size) this.notificationListeners.delete(taskId);
        },
        acknowledge: async (id) => {
          if (this.notifications.get(id)?.taskId !== taskId) return;
          this.notifications.delete(id);
          for (const notify of listeners) notify();
        },
      };
    },
  };

  constructor(private readonly options: CliRunningTaskAdaptorOptions) {
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
    this.resolveSubTaskLLM = options.resolveSubTaskLLM;
  }

  getRequestGetters(
    context: Parameters<RunningTaskAdaptor["getRequestGetters"]>[0],
  ) {
    return {
      getLLM: () => this.llm,
      getEffectiveContextWindow: () => pochiConfig.value.effectiveContextWindow,
      getEnvironment: async () => {
        const environment = await readEnvironment({
          cwd: context.cwd ?? this.cwd,
          omitCustomRules: context.omitCustomRules,
        });
        return {
          ...environment,
          workspace: {
            ...environment.workspace,
            terminals: this.getActiveMonitors(context.taskId).map(
              (monitor) => ({
                name: monitor.description,
                isActive: false,
                backgroundJobId: monitor.backgroundJobId,
                monitor: monitor.description,
                outputFile: monitor.outputFile,
              }),
            ),
          },
        };
      },
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

  async resolveTaskLLM(
    context: Parameters<NonNullable<RunningTaskAdaptor["resolveTaskLLM"]>>[0],
  ): Promise<LLMRequestData | undefined> {
    const { taskState } = context;
    if (!taskState.agentType) {
      return undefined;
    }
    const agent = this.customAgents?.find(
      (a) => a.name === taskState.agentType,
    );
    if (!agent?.model) return undefined;

    try {
      const llm = await this.resolveSubTaskLLM?.(agent);
      if (llm) {
        this.taskLLMs.set(context.taskId, llm);
      }
      return llm;
    } catch (error) {
      logger.warn(
        `Failed to resolve model "${agent.model}" for agent ${agent.name}; falling back to the default model`,
        error,
      );
      return undefined;
    }
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
        this.createToolCallOptions(args.taskId, args.allowBackground),
        this.cwd,
        args.abortSignal,
        (this.taskLLMs.get(args.taskId) ?? this.llm).contentType,
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

  private createToolCallOptions(
    taskId: string,
    allowBackground?: boolean,
  ): ToolCallOptions {
    return {
      taskId,
      allowBackground,
      rg: this.rg,
      fileSystem: this.filesystem,
      fileStateCache: this.getFileStateCache(taskId),
      blobStore: this.blobStore,
      customAgents: this.customAgents,
      skills: this.skills,
      mcpHub: this.mcpHub,
      adaptor: this,
      backgroundJobManager: BackgroundJobManager.forStore(
        this.options.store,
      ).forTask(taskId),
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
  private runningCommands() {
    return Object.fromEntries(
      [...this.commands.values()]
        .filter((job) => job.status === "running")
        .map((job) => [
          job.id,
          {
            taskId: job.taskId,
            command: job.command,
            monitor: job.monitor?.description,
            outputFile: job.outputFile,
            isVisible: false,
          },
        ]),
    );
  }

  private commandsChanged() {
    const running = this.runningCommands();
    for (const listener of this.commandListeners) listener(running);
  }

  startBackgroundCommand(
    taskId: string,
    command: string,
    cwd: string,
    envs?: Record<string, string>,
    monitor?: MonitorJobOptions,
  ): { backgroundJobId: string; outputFile: string } {
    const child = spawn(command, {
      shell: getShellPath(),
      cwd,
      env: { ...process.env, ...getTerminalEnv(), ...envs },
      stdio: ["ignore", "pipe", "pipe"],
      detached: monitor !== undefined && process.platform !== "win32",
    });

    return this.registerBackgroundCommand(
      taskId,
      child,
      command,
      undefined,
      undefined,
      monitor,
    );
  }

  adoptBackgroundCommand(
    taskId: string,
    child: ChildProcess,
    command: string,
    initialOutput: BackgroundJobInitialOutput,
    abortSignal?: AbortSignal,
  ): { backgroundJobId: string; outputFile: string } {
    return this.registerBackgroundCommand(
      taskId,
      child,
      command,
      initialOutput,
      abortSignal,
    );
  }

  private registerBackgroundCommand(
    taskId: string,
    child: ChildProcess,
    command: string,
    initialOutput: BackgroundJobInitialOutput = { stdout: [], stderr: [] },
    abortSignal?: AbortSignal,
    monitor?: MonitorJobOptions,
  ): { backgroundJobId: string; outputFile: string } {
    const id = createBackgroundJobId(monitor ? "monitor" : "command");
    const outputFile = this.options.commandOutputDir
      ? path.join(this.options.commandOutputDir, `${id}.log`)
      : getBackgroundJobOutputPath(taskId, id);
    const outputWriter = new BackgroundJobOutputFile(outputFile);
    const job: BackgroundCommand = {
      taskId,
      id,
      command,
      process: child,
      outputFile,
      outputWriter,
      status: "running",
    };

    this.commands.set(id, job);
    if (monitor) {
      job.monitor = {
        description: monitor.description,
        watcher: new MonitorWatcher({
          onEvents: (lines) => this.emitMonitorEvent(job, lines),
          onTimeout: () => {
            if (job.monitor) job.monitor.endReason = "killed after timeout";
            this.killBackgroundCommand(id);
          },
          onRateLimitExceeded: (reason) => {
            if (job.monitor) job.monitor.endReason = reason;
            this.killBackgroundCommand(id);
          },
          timeoutMs: monitor.timeoutMs,
        }),
      };
    }

    let appendTail = Promise.resolve();
    const appendOutput = (chunk: string): Promise<void> => {
      appendTail = appendTail.then(async () => {
        if (chunk.length === 0) return;
        await outputWriter.append(chunk);
      });
      return appendTail;
    };

    const consumeOutput = async (
      stream: Readable | null,
      initialOutputStream: BackgroundJobInitialOutputStream,
      isStdout: boolean,
    ) => {
      const append = async (text: string) => {
        await appendOutput(text);
        if (isStdout) job.monitor?.watcher.ingest(text);
      };
      const decoder = new StringDecoder("utf8");
      const sanitizer = new PlainOutputSanitizer();
      const initialOutputFinished = (async () => {
        for await (const chunk of initialOutputStream) {
          await append(sanitizer.write(decoder.write(chunk)));
        }
      })();
      const liveOutputFinished = stream
        ? new Promise<void>((resolve, reject) => {
            let liveOutputTail = initialOutputFinished;
            let settled = false;
            const cleanup = () => {
              stream.removeListener("data", onData);
              stream.removeListener("end", onFinished);
              stream.removeListener("close", onFinished);
              stream.removeListener("error", onError);
            };
            const settle = (error?: unknown) => {
              if (settled) return;
              settled = true;
              cleanup();
              liveOutputTail.then(
                () => (error === undefined ? resolve() : reject(error)),
                reject,
              );
            };
            const onData = (chunk: Buffer | string) => {
              stream.pause();
              liveOutputTail = liveOutputTail
                .then(() => append(sanitizer.write(decoder.write(chunk))))
                .then(() => {
                  if (!settled) stream.resume();
                });
              void liveOutputTail.catch(onError);
            };
            const onFinished = () => settle();
            const onError = (error: unknown) => settle(error);

            // Foreground capture pauses the child streams before handing them
            // off. Install the live listener first, then resume. Pausing again
            // on each chunk keeps the handoff bounded while initial output is
            // replayed and retains the chunk even if the stream closes.
            stream.on("data", onData);
            stream.once("end", onFinished);
            stream.once("close", onFinished);
            stream.once("error", onError);
            void initialOutputFinished.catch(onError);
            stream.resume();
          })
        : Promise.resolve();

      await Promise.all([initialOutputFinished, liveOutputFinished]);

      // StringDecoder buffers an incomplete trailing UTF-8 sequence. A
      // manually stopped process may end in the middle of a character, so
      // discard that partial sequence instead of flushing it as U+FFFD.
      if (!job.stopRequested) {
        await append(sanitizer.write(decoder.end()));
      }
      await append(sanitizer.end());
    };

    let outputError: unknown;
    const outputFinished = Promise.all([
      consumeOutput(child.stdout, initialOutput.stdout, true),
      consumeOutput(child.stderr, initialOutput.stderr, false),
    ])
      .finally(() => initialOutput.dispose?.())
      .catch((error) => {
        outputError = error;
        this.killBackgroundCommand(job.id);
      });

    if (abortSignal) {
      const onAbort = () => {
        if (job.status !== "running" || job.finalizing) return;
        job.stopRequested = true;
        this.killBackgroundCommand(job.id);
      };
      abortSignal.addEventListener("abort", onAbort, { once: true });
      job.disposeAbort = () =>
        abortSignal.removeEventListener("abort", onAbort);
      if (abortSignal.aborted) onAbort();
    }

    child.on("close", async (code) => {
      const status = job.stopRequested
        ? "stopped"
        : code === 0
          ? "completed"
          : "failed";
      try {
        await outputFinished;
        if (outputError) throw outputError;
        await this.finalizeBackgroundCommand(job, status, code ?? undefined);
      } catch (error) {
        await this.finalizeBackgroundCommand(
          job,
          "failed",
          code ?? undefined,
          error instanceof Error ? error.message : String(error),
        );
      }
    });

    child.on("error", async (error) => {
      await outputFinished.catch(() => undefined);
      await this.finalizeBackgroundCommand(
        job,
        "failed",
        undefined,
        error.message,
      );
    });

    this.commandsChanged();
    return { backgroundJobId: id, outputFile };
  }

  private async finalizeBackgroundCommand(
    job: BackgroundCommand,
    status: "completed" | "failed" | "stopped",
    exitCode?: number,
    error?: string,
  ): Promise<void> {
    if (job.status !== "running" || job.finalizing) return;
    job.finalizing = true;
    clearTimeout(job.monitor?.killTimer);
    let finalStatus = status;
    let finalError = error;

    try {
      await job.outputWriter.close();
    } catch (closeError) {
      finalStatus = "failed";
      finalError =
        closeError instanceof Error ? closeError.message : String(closeError);
    }
    job.disposeAbort?.();
    job.status = finalStatus;
    job.finalizing = false;

    if (job.monitor) {
      job.monitor.watcher.end();
      this.emitMonitorEvent(job, [], {
        reason:
          job.monitor.endReason ??
          finalError ??
          `exited with code ${exitCode ?? "unknown"}`,
        status: finalStatus,
        ...(exitCode !== undefined ? { exitCode } : {}),
      });
      this.commandsChanged();
      return;
    }
    const event: BackgroundJobTerminalEvent = {
      taskId: job.taskId,
      backgroundJobId: job.id,
      outputFile: job.outputFile,
      status: finalStatus,
      command: job.command,
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(finalError ? { error: finalError } : {}),
      finishedAt: Date.now(),
    };
    const notification = createBackgroundJobNotification(event);
    this.notifications.set(notification.notificationId, {
      taskId: job.taskId,
      notification,
    });
    this.commandsChanged();
    for (const update of this.notificationListeners.get(job.taskId) ?? [])
      update();
  }

  private emitMonitorEvent(
    job: BackgroundCommand,
    lines: string[],
    ended?: MonitorEventEnvelope["ended"],
  ) {
    if (!job.monitor) return;
    const notification: MonitorEventEnvelope = {
      notificationId: crypto.randomUUID(),
      backgroundJobId: job.id,
      description: job.monitor.description,
      command: job.command,
      outputFile: job.outputFile,
      lines,
      ...(ended ? { ended } : {}),
    };
    this.notifications.set(notification.notificationId, {
      taskId: job.taskId,
      notification,
    });
    for (const update of this.notificationListeners.get(job.taskId) ?? [])
      update();
  }

  getActiveMonitors(taskId: string) {
    return [...this.commands.values()].flatMap((job) =>
      job.taskId === taskId && job.monitor && job.status === "running"
        ? [
            {
              backgroundJobId: job.id,
              description: job.monitor.description,
              outputFile: job.outputFile,
            },
          ]
        : [],
    );
  }

  private killBackgroundCommand(id: string): boolean {
    const job = this.commands.get(id);
    if (!job) return false;
    if (job.status !== "running" || job.finalizing) return true;

    job.stopRequested = true;
    const signal = (name: NodeJS.Signals) => {
      if (job.monitor && job.process.pid && process.platform !== "win32") {
        try {
          process.kill(-job.process.pid, name);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
      return job.process.kill(name);
    };
    if (job.monitor && !job.monitor.killTimer) {
      job.monitor.killTimer = setTimeout(() => signal("SIGKILL"), 1000);
    }
    return signal("SIGTERM");
  }

  /** Stop any remaining CLI processes and let their output files finish closing. */
  async stopBackgroundCommands(): Promise<void> {
    for (const command of this.commands.values())
      this.killBackgroundCommand(command.id);
    const deadline = Date.now() + 5000;
    while (
      [...this.commands.values()].some(
        (command) => command.status === "running" || command.finalizing,
      )
    ) {
      if (Date.now() >= deadline) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
  }
}
