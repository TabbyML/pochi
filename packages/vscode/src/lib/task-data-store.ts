import { getLogger } from "@getpochi/common";
import type {
  AutoMemoryTaskState,
  BackgroundTaskState,
  ContextWindowUsage,
  TaskMemoryState,
} from "@getpochi/common";
import type {
  McpConfigOverride,
  TaskChangedFile,
} from "@getpochi/common/vscode-webui-bridge";
import { computed, signal } from "@preact/signals-core";
import * as runExclusive from "run-exclusive";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

type TaskStateData = {
  mcpConfigOverride?: McpConfigOverride;
  archived?: boolean;
  pinned?: boolean;
  changedFiles?: TaskChangedFile[];
  contextWindowUsage?: ContextWindowUsage;
  taskMemoryState?: TaskMemoryState;
  autoMemoryState?: AutoMemoryTaskState;
  backgroundTaskState?: BackgroundTaskState;
  // unix timestamp in milliseconds
  updatedAt: number;
};

const logger = getLogger("TaskDataStore");

// 36 days in milliseconds
const StaleDataThresholdMs = 36 * 24 * 60 * 60 * 1000;

@injectable()
@singleton()
export class TaskDataStore {
  private readonly storageKey = "task-state";

  state = signal<Record<string, TaskStateData>>({});

  /** Serializes saveTaskState writes to avoid last-write-wins races. */
  private writeGroup = runExclusive.createGroupRef();

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {
    this.loadAndCleanupState();
  }

  private async loadAndCleanupState(): Promise<void> {
    const storedState = this.context.globalState.get<
      Record<string, TaskStateData>
    >(this.storageKey, {});

    const now = Date.now();
    const cutoff = now - StaleDataThresholdMs;

    const validState: Record<string, TaskStateData> = {};
    let hasStaleData = false;

    for (const [taskId, taskData] of Object.entries(storedState)) {
      // Handle legacy data without updatedAt by treating it as current
      const updatedAt = taskData.updatedAt ?? now;
      if (updatedAt > cutoff) {
        validState[taskId] = { ...taskData, updatedAt };
      } else {
        logger.debug(
          `Removing stale task data: ${taskId}, last updated at: ${new Date(updatedAt).toISOString()}`,
        );
        hasStaleData = true;
      }
    }

    this.state.value = validState;

    if (hasStaleData) {
      await this.context.globalState.update(this.storageKey, validState);
    }
  }

  private getTaskState(taskId: string): TaskStateData | undefined {
    return this.state.value[taskId];
  }

  /**
   * Merges `patch` into the task's state inside `writeGroup`. Pass only
   * the fields to change; do not spread the previous state in.
   */
  private saveTaskState = runExclusive.build(
    this.writeGroup,
    async (
      taskId: string,
      patch: Partial<Omit<TaskStateData, "updatedAt">>,
    ): Promise<void> => {
      const current = this.state.value[taskId] ?? ({} as TaskStateData);
      const merged: TaskStateData = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      };
      const newState = { ...this.state.value, [taskId]: merged };
      await this.context.globalState.update(this.storageKey, newState);
      this.state.value = newState;
    },
  );

  getMcpConfigOverride(taskId: string): McpConfigOverride | undefined {
    return this.getTaskState(taskId)?.mcpConfigOverride;
  }

  async setMcpConfigOverride(
    taskId: string,
    mcpConfigOverride: McpConfigOverride,
  ): Promise<McpConfigOverride> {
    logger.debug(
      `setMcpConfigOverride for task ${taskId}: ${JSON.stringify(mcpConfigOverride)}`,
    );
    await this.saveTaskState(taskId, { mcpConfigOverride });
    return mcpConfigOverride;
  }

  /**
   * Get a computed signal for a specific task's mcpConfigOverride.
   * Used for ThreadSignal serialization.
   */
  getMcpConfigOverrideSignal(taskId: string) {
    // Ensure task is loaded
    this.getTaskState(taskId);
    return computed(() => this.state.value[taskId]?.mcpConfigOverride);
  }

  async setArchived(updates: Record<string, boolean>): Promise<void> {
    const newState = { ...this.state.value };
    const now = Date.now();
    for (const [taskId, archived] of Object.entries(updates)) {
      const existing = newState[taskId] || { updatedAt: now };
      newState[taskId] = { ...existing, archived, updatedAt: now };
    }
    await this.context.globalState.update(this.storageKey, newState);
    this.state.value = newState;
  }

  /**
   * Get a computed signal for all tasks' archived states.

   * Returns a Record<taskId, archived> for all tasks.
   * Used for ThreadSignal serialization.
   */
  getArchivedSignal() {
    return computed(() => {
      const result: Record<string, boolean> = {};
      for (const [taskId, taskData] of Object.entries(this.state.value)) {
        if (taskData.archived !== undefined) {
          result[taskId] = taskData.archived;
        }
      }
      return result;
    });
  }

  async setPinned(updates: Record<string, boolean>): Promise<void> {
    const newState = { ...this.state.value };
    const now = Date.now();
    for (const [taskId, pinned] of Object.entries(updates)) {
      const existing = newState[taskId] || { updatedAt: now };
      newState[taskId] = { ...existing, pinned, updatedAt: now };
    }
    await this.context.globalState.update(this.storageKey, newState);
    this.state.value = newState;
  }

  /**
   * Get a computed signal for all tasks' pinned states.
   *
   * Returns a Record<taskId, pinned> for all tasks.
   * Used for ThreadSignal serialization.
   */
  getPinnedSignal() {
    return computed(() => {
      const result: Record<string, boolean> = {};
      for (const [taskId, taskData] of Object.entries(this.state.value)) {
        if (taskData.pinned !== undefined) {
          result[taskId] = taskData.pinned;
        }
      }
      return result;
    });
  }

  getChangedFiles(taskId: string): TaskChangedFile[] {
    return this.getTaskState(taskId)?.changedFiles ?? [];
  }

  async setChangedFiles(
    taskId: string,
    changedFiles: TaskChangedFile[],
  ): Promise<void> {
    logger.debug(
      `setChangedFiles for task ${taskId}: ${changedFiles.length} files`,
    );
    await this.saveTaskState(taskId, { changedFiles });
  }

  /**
   * Get a computed signal for a specific task's changedFiles.
   * Used for ThreadSignal serialization.
   */
  getChangedFilesSignal(taskId: string) {
    return computed(() => this.state.value[taskId]?.changedFiles ?? []);
  }

  async setContextWindowUsage(
    taskId: string,
    contextWindowUsage: ContextWindowUsage,
  ): Promise<void> {
    await this.saveTaskState(taskId, { contextWindowUsage });
  }

  /**
   * Get a computed signal for a specific task's contextWindowUsage.
   * Used for ThreadSignal serialization.
   */
  getContextWindowUsageSignal(taskId: string) {
    return computed(() => this.state.value[taskId]?.contextWindowUsage);
  }

  getTaskMemoryState(taskId: string): TaskMemoryState | undefined {
    return this.getTaskState(taskId)?.taskMemoryState;
  }

  async setTaskMemoryState(
    taskId: string,
    taskMemoryState: TaskMemoryState,
  ): Promise<void> {
    await this.saveTaskState(taskId, { taskMemoryState });
  }

  getTaskMemoryStateSignal(taskId: string) {
    return computed(() => this.state.value[taskId]?.taskMemoryState);
  }

  getAutoMemoryState(taskId: string): AutoMemoryTaskState | undefined {
    return this.getTaskState(taskId)?.autoMemoryState;
  }

  async setAutoMemoryState(
    taskId: string,
    autoMemoryState: AutoMemoryTaskState,
  ): Promise<void> {
    await this.saveTaskState(taskId, { autoMemoryState });
  }

  getAutoMemoryStateSignal(taskId: string) {
    return computed(() => this.state.value[taskId]?.autoMemoryState);
  }

  getBackgroundTaskState(taskId: string): BackgroundTaskState | undefined {
    return this.getTaskState(taskId)?.backgroundTaskState;
  }

  async setBackgroundTaskState(
    taskId: string,
    backgroundTaskState: BackgroundTaskState,
  ): Promise<void> {
    await this.saveTaskState(taskId, { backgroundTaskState });
  }

  getBackgroundTaskStateSignal(taskId: string) {
    return computed(() => this.state.value[taskId]?.backgroundTaskState);
  }
}
