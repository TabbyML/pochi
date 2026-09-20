import {
  type BackgroundJobNotification,
  type BackgroundTaskState,
  type MaybePromise,
  getLogger,
  getSubAgentBackgroundJobId,
  getSubAgentTaskId,
  withTimeout,
} from "@getpochi/common";
import type { BackgroundCommands } from "@getpochi/common/vscode-webui-bridge";
import { parseOutputSchema } from "@getpochi/tools";
import { isShallowEqual } from "remeda";
import type { ForkAgent, ForkAgentHandle } from "../background-task/fork-agent";
import { AutoMemoryAdaptor } from "../background-task/memory/auto-memory";
import { TaskMemoryAdaptor } from "../background-task/memory/task-memory";
import { InMemoryChat } from "../background-task/task-executor/in-memory-chat";
import {
  type RunningTaskAdaptor,
  TaskExecutor,
} from "../background-task/task-executor/task-executor";
import type { BlobStore } from "../blob-store";
import { getBackgroundJobNotificationIds } from "../chat/background-job-notification";
import {
  LiveChatKit,
  type LiveChatKitProjectMemoryOptions,
  type LiveChatKitTaskMemoryOptions,
} from "../chat/live-chat-kit";
import { defaultCatalog as catalog } from "../livestore";
import { createBackgroundSubagentNotification } from "../task-utils";
import type { LiveKitStore, Message } from "../types";
import type { BackgroundJobEntry, JobStatus } from "./state";

const logger = getLogger("BackgroundJobManager");

export type BackgroundTaskStateStore = {
  read(taskId: string): MaybePromise<BackgroundTaskState | undefined>;
  set(taskId: string, state: BackgroundTaskState): MaybePromise<void>;
};

export type BackgroundJobManagerOptions = {
  blobStore: BlobStore;
  adaptor: RunningTaskAdaptor & {
    commandAdaptor?: BackgroundCommandAdaptor;
    dispose?: () => void;
  };
  stateStore?: BackgroundTaskStateStore;
  clearFileStateCache?: (taskId: string) => MaybePromise<void>;
};

/**
 * Platform interface for observing and stopping background command processes.
 * BackgroundJobManager decides ownership, waiting, and result delivery.
 */
export interface BackgroundCommandAdaptor {
  kill(backgroundJobId: string): Promise<void>;
  observeCommands(onChange: (running: BackgroundCommands) => void): Promise<{
    dispose(): void;
  }>;
  observeNotifications(
    taskId: string,
    onChange: (notifications: readonly BackgroundJobNotification[]) => void,
  ): Promise<{
    dispose(): void;
    acknowledge(notificationId: string): Promise<void>;
  }>;
}

type CommandNotification = Extract<
  BackgroundJobNotification,
  { kind: "command" }
>;

type Job = {
  id: string;
  ownerTaskId: string;
} & (
  | {
      kind: "command";
      title: string;
      outputFile?: string;
      status: JobStatus;
      notification?: CommandNotification;
    }
  | { kind: "subagent"; taskId: string; agentType?: string }
  | { kind: "fork"; taskId: string }
);

export type KillOptions = {
  /**
   * Send the stop to the owner task as a notification. Off when the owner
   * stopped the job with its own `killBackgroundJob` call: it already learns
   * the outcome from the tool result, and a notification would cost a turn.
   */
  notify?: boolean;
};

type TaskSubscription = {
  ready: Promise<void>;
  notifications: readonly CommandNotification[];
  dispose?: () => void;
  acknowledge?: (id: string) => Promise<void>;
  acknowledging: Set<string>;
  listeners: Set<(notifications: BackgroundJobNotification[]) => void>;
};

/** One manager per store. All task-scoped handles below delegate to this instance. */
export class BackgroundJobManager {
  private static readonly stores = new WeakMap<
    LiveKitStore,
    BackgroundJobManager
  >();

  static forStore(store: LiveKitStore) {
    let manager = BackgroundJobManager.stores.get(store);
    if (!manager || manager.disposed) {
      manager = new BackgroundJobManager(store);
      BackgroundJobManager.stores.set(store, manager);
    }
    return manager;
  }

  private readonly jobs = new Map<string, Job>();
  private commandAdaptor?: BackgroundCommandAdaptor;
  private executor?: TaskExecutor;
  private adaptor?: BackgroundJobManagerOptions["adaptor"];
  private readonly taskStates = new Map<string, BackgroundTaskState>();
  private taskStateStore: BackgroundTaskStateStore = {
    read: (taskId) => this.taskStates.get(taskId),
    set: (taskId, state) => {
      this.taskStates.set(taskId, state);
    },
  };
  // Only forks created in this Webview/run can reuse their parent's request.
  private readonly forkSystemPrompts = new Map<string, string | undefined>();
  private readonly taskMemories = new Map<string, TaskMemoryAdaptor>();
  private readonly autoMemories = new Map<string, AutoMemoryAdaptor>();
  private readonly subscriptions = new Map<string, TaskSubscription>();
  /** Jobs whose owner stopped them itself; their notifications stay undelivered. */
  private readonly silenced = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribers: Array<() => void> = [];
  private backgroundTasksReady?: Promise<void>;
  private readonly taskRegistrations = new Map<string, Promise<void>>();
  private commandsReady?: Promise<void>;
  private disposeCommands?: () => void;
  private runningCommands: BackgroundCommands = {};
  private readonly changedTasks = new Set<string>();
  private batchDepth = 0;
  private revision = 0;
  private disposed = false;

  private constructor(private readonly store: LiveKitStore) {}

  /** Called once by the task panel or CLI root, never by a chat page. */
  initialize(options: BackgroundJobManagerOptions) {
    if (this.disposed) throw new Error("Background job manager is disposed.");
    if (this.adaptor === options.adaptor) return;
    if (this.executor)
      throw new Error("Background task executor is already connected.");
    this.adaptor = options.adaptor;
    if (options.stateStore) this.taskStateStore = options.stateStore;
    if (options.adaptor.commandAdaptor)
      this.connect(options.adaptor.commandAdaptor);
    this.executor = new TaskExecutor({
      store: this.store,
      blobStore: options.blobStore,
      onTaskSettled: (taskId) => this.taskChanged(taskId),
      adaptor: {
        waitUntilReady: () =>
          options.adaptor.waitUntilReady?.() ?? Promise.resolve(),
        getRequestGetters: (context) =>
          options.adaptor.getRequestGetters(context),
        resolveTaskLLM: (context) =>
          options.adaptor.resolveTaskLLM?.(context) ??
          Promise.resolve(undefined),
        onTaskError: (taskId, error) =>
          options.adaptor.onTaskError?.(taskId, error),
        executeToolCall: (args) =>
          args.toolName === "killBackgroundJob"
            ? this.kill(
                (args.input as { backgroundJobId: string }).backgroundJobId,
                args.taskId,
                { notify: false },
              )
            : options.adaptor.executeToolCall(args),
      },
      readTaskState: (taskId) => this.taskStateStore.read(taskId),
      shouldRunForkTask: (taskId) => this.forkSystemPrompts.has(taskId),
      clearFileStateCache: options.clearFileStateCache,
      waitForBackgroundJobs: async (taskId, abortSignal) => {
        await this.wait(taskId, { abortSignal });
      },
      createChatKit: async ({
        taskId,
        store,
        blobStore,
        abortSignal,
        taskState,
        getters,
        appendMessage,
      }) => {
        await this.watchTask(taskId);
        abortSignal.throwIfAborted();
        const isSubagent = taskState.useCase === undefined;
        const customAgent =
          isSubagent && taskState.agentType
            ? getters
                .getCustomAgents?.()
                ?.find((agent) => agent.name === taskState.agentType)
            : undefined;
        const resultSchema = customAgent?._internal?.resultSchema;
        return new LiveChatKit<InMemoryChat>({
          taskId,
          store,
          blobStore,
          abortSignal,
          getters,
          backgroundJobNotifications: { startTurn: appendMessage },
          backgroundJobManager: this,
          chatClass: InMemoryChat,
          isSubTask: isSubagent,
          requestUseCase: taskState.useCase ?? "agent",
          customAgent,
          attemptCompletionSchema: resultSchema
            ? parseOutputSchema(resultSchema)
            : undefined,
          systemPromptOverride: isSubagent
            ? undefined
            : this.forkSystemPrompts.get(taskId),
        });
      },
    });
    this.start();
  }

  async backgroundSubTask(
    {
      taskId,
      parentTaskId,
      agentType,
      stopForeground,
    }: {
      taskId: string;
      parentTaskId: string;
      agentType?: string;
      stopForeground?: () => Promise<void>;
    },
    abortSignal?: AbortSignal,
  ) {
    abortSignal?.throwIfAborted();
    if (this.disposed) throw new Error("Background job manager is disposed.");
    const task = this.store.query(catalog.queries.makeTaskQuery(taskId));
    if (!task || task.parentId !== parentTaskId)
      throw new Error("Subtask does not belong to this parent.");
    const state = { parentTaskId, agentType };
    await this.taskStateStore.set(taskId, state);
    abortSignal?.throwIfAborted();
    if (this.disposed) throw new Error("Background job manager is disposed.");

    if (stopForeground) {
      const result = await withTimeout(
        stopForeground(),
        10_000,
        "Stop foreground subtask",
      );
      if (result === null)
        throw new Error("Timed out waiting for foreground execution to stop.");
      if (abortSignal?.aborted)
        throw new Error("Subtask execution was cancelled during handoff.");
      if (this.disposed) throw new Error("Background job manager is disposed.");
    }

    const settled = this.store.query(catalog.queries.makeTaskQuery(taskId));
    if (!settled || settled.parentId !== parentTaskId)
      throw new Error("Subtask does not belong to this parent.");
    // Stopping the foreground request may leave an AbortError. Resume that
    // turn atomically with the handoff so no stopped notification escapes.
    // Completed results and unanswered questions need registration, not a retry.
    const resume = stopForeground && settled.status === "failed";
    const lastMessage = resume ? this.messages(taskId).at(-1) : undefined;
    if (resume && !lastMessage)
      throw new Error("Failed to resume the background subtask.");
    this.batch(() => {
      const updatedAt = new Date();
      this.store.commit(
        catalog.events.taskBackgrounded({ id: taskId, updatedAt }),
        ...(lastMessage
          ? [
              catalog.events.chatStreamStarted({
                id: taskId,
                data: lastMessage,
                todos: settled.todos ? [...settled.todos] : [],
                modelId: settled.modelId ?? undefined,
                updatedAt,
              }),
            ]
          : []),
      );
      this.registerTask(taskId, state);
    });
  }

  startForkAgent = async (
    agent: ForkAgent<Message>,
  ): Promise<ForkAgentHandle> => {
    if (this.disposed) throw new Error("Background job manager is disposed.");
    const taskId = crypto.randomUUID();
    this.forkSystemPrompts.set(taskId, agent.systemPrompt);
    try {
      const state: BackgroundTaskState = {
        parentTaskId: agent.parentTaskId,
        tools: agent.tools,
        useCase: agent.label,
        maxSteps: agent.maxSteps,
        baselineStepCount: agent.baselineStepCount,
      };
      await this.taskStateStore.set(taskId, state);
      if (this.disposed) throw new Error("Background job manager is disposed.");
      this.batch(() => {
        this.store.commit(
          catalog.events.taskInited({
            id: taskId,
            cwd: agent.cwd,
            background: true,
            createdAt: new Date(),
            initMessages: agent.initMessages,
            initTitle: agent.initTitle,
          }),
        );
        this.registerTask(taskId, state);
      });
      return { taskId, cwd: agent.cwd, label: agent.label };
    } catch (error) {
      this.forkSystemPrompts.delete(taskId);
      throw error;
    }
  };

  getTaskMemory(taskId: string, options: LiveChatKitTaskMemoryOptions) {
    let memory = this.taskMemories.get(taskId);
    if (!memory) {
      memory = new TaskMemoryAdaptor({
        store: this.store,
        parentTaskId: taskId,
        parentCwd: () =>
          this.store.query(catalog.queries.makeTaskQuery(taskId))?.cwd ??
          undefined,
        taskMemoryStateStore: options.stateStore,
        backgroundTask: {
          startForkAgent: this.startForkAgent,
          waitForTaskDone: (id) => this.waitForTaskDone(id),
        },
      });
      this.taskMemories.set(taskId, memory);
    }
    return memory;
  }

  getAutoMemory(taskId: string, options: LiveChatKitProjectMemoryOptions) {
    let memory = this.autoMemories.get(taskId);
    if (!memory) {
      memory = new AutoMemoryAdaptor({
        store: this.store,
        parentTaskId: taskId,
        parentCwd: () =>
          this.store.query(catalog.queries.makeTaskQuery(taskId))?.cwd ??
          undefined,
        autoMemoryStateStore: options.stateStore,
        manager: options.manager,
        backgroundTask: {
          startForkAgent: this.startForkAgent,
          waitForTaskDone: (id) => this.waitForTaskDone(id),
        },
      });
      this.autoMemories.set(taskId, memory);
    }
    return memory;
  }

  connect(adaptor: BackgroundCommandAdaptor) {
    if (this.commandAdaptor === adaptor) return;
    if (this.commandAdaptor)
      throw new Error("Background command adaptor is already connected.");
    this.commandAdaptor = adaptor;
  }

  setExecutor(executor: TaskExecutor) {
    if (this.executor && this.executor !== executor)
      throw new Error("Background task executor is already connected.");
    this.executor = executor;
  }

  private setJob(job: Job) {
    if (isShallowEqual(this.jobs.get(job.id), job)) return;
    this.jobs.set(job.id, job);
    this.changedTasks.add(job.ownerTaskId);
    this.changed();
  }

  registerTask(taskId: string, state: BackgroundTaskState) {
    const task = this.store.query(catalog.queries.makeTaskQuery(taskId));
    const ownerTaskId = state.parentTaskId ?? task?.parentId;
    if (!ownerTaskId) return;
    const id = getSubAgentBackgroundJobId(taskId);
    if (state.stoppedByParent) this.silenced.add(id);
    const registered = this.jobs.has(id);
    this.setJob({
      id,
      ownerTaskId,
      taskId,
      ...(state.useCase
        ? { kind: "fork" }
        : { kind: "subagent", agentType: state.agentType }),
    });
    if (!registered) {
      const unsubscribe = this.store.subscribe(
        catalog.queries.makeTaskQuery(taskId),
        () => this.taskChanged(taskId),
      );
      if (unsubscribe) this.unsubscribers.push(unsubscribe);
    }
  }

  /** Restore every job, including queued tasks and results with no active runner. */
  private restoreBackgroundTasks() {
    for (const task of this.store.query(catalog.queries.backgroundTasks$)) {
      const id = getSubAgentBackgroundJobId(task.id);
      if (this.jobs.has(id) || this.taskRegistrations.has(task.id)) continue;
      const registration = (async () => {
        const state = await this.taskStateStore.read(task.id);
        // A local launch may have registered newer metadata while this read
        // was in flight. It owns that registration.
        if (!this.disposed && !this.jobs.has(id))
          this.registerTask(task.id, state ?? {});
      })()
        .catch((error) => {
          logger.warn(
            { taskId: task.id, error },
            "Failed to restore background job metadata",
          );
        })
        .finally(() => this.taskRegistrations.delete(task.id));
      this.taskRegistrations.set(task.id, registration);
    }
    return Promise.all(this.taskRegistrations.values()).then(() => undefined);
  }

  getTaskStatus(taskId: string): JobStatus | undefined {
    const task = this.store.query(catalog.queries.makeTaskQuery(taskId));
    if (!task?.background) return undefined;
    if (
      this.executor?.isTaskRunning(taskId) ||
      task.status === "pending-model" ||
      task.status === "pending-tool"
    )
      return "running";
    if (task.status === "failed")
      return task.error?.kind === "AbortError" ? "stopped" : "failed";
    return "completed";
  }

  isTaskPending(taskId: string) {
    return this.getTaskStatus(taskId) === "running";
  }

  taskChanged(taskId: string) {
    const job = this.jobs.get(getSubAgentBackgroundJobId(taskId));
    if (!job) return;
    this.changedTasks.add(job.ownerTaskId);
    this.changed();
  }

  private messages(taskId: string): Message[] {
    return this.store
      .query(catalog.queries.makeMessagesQuery(taskId))
      .map((row) => row.data as Message);
  }

  private observeCommands() {
    if (!this.commandsReady) {
      this.commandsReady = (async () => {
        if (!this.commandAdaptor) return;
        const remote = await this.commandAdaptor.observeCommands((running) => {
          if (this.disposed) return;
          this.runningCommands = running;
          this.batch(() => this.updateCommands());
        });
        if (this.disposed) remote.dispose();
        else this.disposeCommands = remote.dispose;
      })().catch((error) => {
        this.commandsReady = undefined;
        throw error;
      });
    }
    return this.commandsReady;
  }

  private updateCommands(ownerTaskId?: string) {
    for (const [id, command] of Object.entries(this.runningCommands)) {
      const taskId = command.taskId;
      if (
        !taskId ||
        !this.subscriptions.has(taskId) ||
        (ownerTaskId && taskId !== ownerTaskId)
      )
        continue;
      const old = this.jobs.get(id);
      // Command IDs are never reused. A late process snapshot cannot undo its result.
      if (
        old &&
        (old.kind !== "command" ||
          old.ownerTaskId !== taskId ||
          old.status !== "running")
      )
        continue;
      this.setJob({
        id,
        ownerTaskId: taskId,
        kind: "command",
        title: command.command ?? "Command",
        outputFile: command.outputFile,
        status: "running",
      });
    }
  }

  async watchTask(taskId: string) {
    const existing = this.subscriptions.get(taskId);
    if (existing) return existing.ready;
    const subscription: TaskSubscription = {
      ready: Promise.resolve(),
      notifications: [],
      acknowledging: new Set(),
      listeners: new Set(),
    };
    this.subscriptions.set(taskId, subscription);
    const unsubscribe = this.store.subscribe(
      catalog.queries.makeMessagesQuery(taskId),
      () => {
        this.changedTasks.add(taskId);
        this.changed();
      },
    );
    if (unsubscribe) this.unsubscribers.push(unsubscribe);

    subscription.ready = (async () => {
      await this.backgroundTasksReady;
      if (this.disposed) return;
      if (!this.commandAdaptor) return;
      const notificationsReady = this.commandAdaptor
        .observeNotifications(taskId, (notifications) => {
          if (this.disposed) return;
          this.batch(() => {
            const owned = notifications.filter(
              (notice): notice is CommandNotification => {
                const job = this.jobs.get(notice.backgroundJobId);
                return (
                  notice.kind === "command" &&
                  (!job || job.ownerTaskId === taskId)
                );
              },
            );
            if (
              owned.length !== subscription.notifications.length ||
              owned.some(
                (notice, index) =>
                  notice.notificationId !==
                  subscription.notifications[index]?.notificationId,
              )
            ) {
              subscription.notifications = owned;
              this.changedTasks.add(taskId);
            }
            for (const notice of owned) {
              const old = this.jobs.get(notice.backgroundJobId);
              if (
                old?.kind === "command" &&
                old.notification?.notificationId === notice.notificationId
              )
                continue;
              this.setJob({
                id: notice.backgroundJobId,
                ownerTaskId: taskId,
                kind: "command",
                title:
                  notice.command ??
                  (old?.kind === "command" ? old.title : undefined) ??
                  "Command",
                outputFile: notice.outputFile,
                status: notice.status,
                notification: notice,
              });
            }
          });
        })
        .then((remote) => {
          if (this.disposed || this.subscriptions.get(taskId) !== subscription)
            remote.dispose();
          else {
            subscription.dispose = remote.dispose;
            subscription.acknowledge = remote.acknowledge;
          }
        });
      await Promise.all([this.observeCommands(), notificationsReady]);
      if (this.disposed) return;
      this.batch(() => {
        this.updateCommands(taskId);
        this.deliver(taskId);
      });
    })().catch((error) => {
      subscription.dispose?.();
      unsubscribe?.();
      this.subscriptions.delete(taskId);
      throw error;
    });
    return subscription.ready;
  }

  getPendingNotifications(taskId: string): BackgroundJobNotification[] {
    return this.readNotifications(taskId).pending;
  }

  private readNotifications(taskId: string) {
    const messages = this.messages(taskId);
    const delivered = new Set(
      messages.flatMap((message) =>
        getBackgroundJobNotificationIds(message.parts),
      ),
    );
    const notifications: BackgroundJobNotification[] = [
      ...(this.subscriptions.get(taskId)?.notifications ?? []),
    ];
    for (const job of this.jobs.values()) {
      if (
        job.ownerTaskId !== taskId ||
        job.kind !== "subagent" ||
        this.silenced.has(job.id) ||
        this.isTaskPending(job.taskId)
      )
        continue;
      const task = this.store.query(catalog.queries.makeTaskQuery(job.taskId));
      if (task)
        notifications.push(
          createBackgroundSubagentNotification(this.store, task, messages),
        );
    }
    return {
      delivered,
      pending: notifications.filter(
        (notice) =>
          !delivered.has(notice.notificationId) &&
          !this.silenced.has(notice.backgroundJobId),
      ),
    };
  }

  subscribeNotifications(
    taskId: string,
    listener: (notifications: BackgroundJobNotification[]) => void,
  ) {
    void this.watchTask(taskId)
      .then(() => {
        if (!active) return;
        this.subscriptions.get(taskId)?.listeners.add(listener);
        this.deliver(taskId);
      })
      .catch((error) =>
        logger.warn("Failed to observe background jobs", error),
      );
    let active = true;
    return () => {
      active = false;
      this.subscriptions.get(taskId)?.listeners.delete(listener);
    };
  }

  private deliver(taskId: string) {
    const subscription = this.subscriptions.get(taskId);
    if (!subscription) return;
    const { delivered, pending } = this.readNotifications(taskId);
    for (const notice of subscription.notifications) {
      const id = notice.notificationId;
      const silenced = this.silenced.has(notice.backgroundJobId);
      if (
        (!delivered.has(id) && !silenced) ||
        !subscription.acknowledge ||
        subscription.acknowledging.has(id)
      )
        continue;
      subscription.acknowledging.add(id);
      void subscription.acknowledge(id).then(
        // The host dropped it, so the flag no longer has to outlive the notice.
        () => this.silenced.delete(notice.backgroundJobId),
        (error) => {
          subscription.acknowledging.delete(id);
          logger.warn(
            "Failed to acknowledge background job notification",
            error,
          );
        },
      );
    }
    for (const listener of subscription.listeners) listener(pending);
  }

  private isJobPending(job: Job) {
    return job.kind === "command"
      ? job.status === "running"
      : this.isTaskPending(job.taskId);
  }

  hasPending(taskId: string): boolean {
    return [...this.jobs.values()].some(
      (job) => job.ownerTaskId === taskId && this.isJobPending(job),
    );
  }

  async wait(
    taskId: string,
    options: {
      timeoutMs?: number;
      abortSignal?: AbortSignal;
    } = {},
  ): Promise<"completed" | "timeout" | "aborted"> {
    if (options.abortSignal?.aborted) return "aborted";
    if (!this.hasPending(taskId)) return "completed";
    if (options.timeoutMs === 0) return "timeout";
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: "completed" | "timeout" | "aborted") => {
        if (timer) clearTimeout(timer);
        this.listeners.delete(check);
        options.abortSignal?.removeEventListener("abort", check);
        resolve(result);
      };
      const check = () => {
        if (this.disposed || options.abortSignal?.aborted) finish("aborted");
        else if (!this.hasPending(taskId)) finish("completed");
      };
      this.listeners.add(check);
      options.abortSignal?.addEventListener("abort", check, { once: true });
      if (options.timeoutMs !== undefined)
        timer = setTimeout(() => finish("timeout"), options.timeoutMs);
      check();
    });
  }

  forTask(taskId: string) {
    return {
      kill: (id: string, options?: KillOptions) =>
        BackgroundJobManager.forStore(this.store).kill(id, taskId, options),
    };
  }

  getJobsForTask(taskId: string): BackgroundJobEntry[] {
    const pending = new Set(
      this.getPendingNotifications(taskId).map((n) => n.backgroundJobId),
    );
    return [...this.jobs.values()]
      .filter((job) => job.ownerTaskId === taskId)
      .flatMap((job): BackgroundJobEntry[] => {
        const entry = {
          backgroundJobId: job.id,
          notificationPending: pending.has(job.id),
        };
        if (job.kind === "command")
          return [
            {
              ...entry,
              kind: job.kind,
              title: job.title,
              status: job.status,
              command: job.title,
              outputFile: job.outputFile,
              exitCode: job.notification?.exitCode,
            },
          ];
        const task = this.store.query(
          catalog.queries.makeTaskQuery(job.taskId),
        );
        const status = this.getTaskStatus(job.taskId);
        if (!task || !status) return [];
        return [
          {
            ...entry,
            ...(job.kind === "subagent"
              ? { kind: job.kind, agentType: job.agentType }
              : { kind: job.kind }),
            title:
              task.title ||
              (job.kind === "subagent"
                ? (job.agentType ?? "Subagent")
                : "Fork"),
            status,
            taskId: job.taskId,
          },
        ];
      });
  }

  async kill(
    backgroundJobId: string,
    taskId: string,
    { notify = true }: KillOptions = {},
  ): Promise<{ success: true }> {
    const job = this.jobs.get(backgroundJobId);
    const childId = getSubAgentTaskId(backgroundJobId);
    const child = childId
      ? this.store.query(catalog.queries.makeTaskQuery(childId))
      : undefined;
    if (
      job
        ? job.ownerTaskId !== taskId
        : !(child?.background && child.parentId === taskId)
    ) {
      throw new Error(`Background job with ID "${backgroundJobId}" not found.`);
    }
    // Claimed before the job can finish, so its notification cannot slip out.
    if (!notify) this.silenced.add(backgroundJobId);
    if (childId) {
      // A subagent notification is derived from task state and never
      // acknowledged, so the flag has to survive a reload.
      if (!notify) {
        const state = (await this.taskStateStore.read(childId)) ?? {};
        await this.taskStateStore.set(childId, {
          ...state,
          stoppedByParent: true,
        });
      }
      await this.stopOwnedJobs(childId);
      if (this.executor) await this.executor.stopTask(childId);
      else if (
        child &&
        child.status !== "completed" &&
        child.status !== "failed"
      )
        this.store.commit(
          catalog.events.taskFailed({
            id: childId,
            error: { kind: "AbortError", message: "Stopped by user." },
            updatedAt: new Date(),
          }),
        );
      this.taskChanged(childId);
    } else {
      if (!this.commandAdaptor)
        throw new Error("Background command adaptor is not connected.");
      await this.commandAdaptor.kill(backgroundJobId);
    }
    return { success: true };
  }

  async stopOwnedJobs(taskId: string) {
    await Promise.all(
      [...this.jobs.values()]
        .filter((job) => job.ownerTaskId === taskId && this.isJobPending(job))
        .map((job) => this.kill(job.id, taskId)),
    );
  }
  start() {
    if (this.disposed) return;
    if (!this.backgroundTasksReady) {
      const unsubscribe = this.store.subscribe(
        catalog.queries.backgroundTasks$,
        () => {
          if (!this.disposed) void this.restoreBackgroundTasks();
        },
      );
      if (unsubscribe) this.unsubscribers.push(unsubscribe);
      this.backgroundTasksReady = this.restoreBackgroundTasks();
    }
    this.executor?.start();
  }
  waitForTaskDone(taskId: string) {
    return this.executor?.waitForTaskDone(taskId) ?? Promise.resolve();
  }
  async drain(abortSignal?: AbortSignal) {
    await this.backgroundTasksReady;
    await this.executor?.drain(abortSignal);
  }
  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeCommands?.();
    for (const subscription of this.subscriptions.values())
      subscription.dispose?.();
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.changed();
    await this.executor?.dispose();
    this.adaptor?.dispose?.();
    if (BackgroundJobManager.stores.get(this.store) === this)
      BackgroundJobManager.stores.delete(this.store);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.revision;
  private batch(update: () => void) {
    this.batchDepth++;
    try {
      update();
    } finally {
      this.batchDepth--;
      this.changed();
    }
  }

  private changed() {
    if (this.batchDepth > 0 || (!this.changedTasks.size && !this.disposed))
      return;
    this.batchDepth++;
    try {
      while (this.changedTasks.size > 0) {
        const taskIds = [...this.changedTasks];
        this.changedTasks.clear();
        for (const taskId of taskIds) this.deliver(taskId);
      }
    } finally {
      this.batchDepth--;
    }
    this.revision++;
    for (const listener of this.listeners) listener();
  }
}
