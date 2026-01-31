import { getLogger } from "@getpochi/common";
import type {
  McpConfigOverride,
  TaskChangedFile,
} from "@getpochi/common/vscode-webui-bridge";
import { computed, signal } from "@preact/signals-core";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

type TaskStateData = {
  mcpConfigOverride?: McpConfigOverride;
  archived?: boolean;
  changedFiles?: TaskChangedFile[];
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

  private async saveTaskState(
    taskId: string,
    data: Omit<TaskStateData, "updatedAt">,
  ): Promise<void> {
    const taskData: TaskStateData = { ...data, updatedAt: Date.now() };
    const newState = { ...this.state.value, [taskId]: taskData };
    await this.context.globalState.update(this.storageKey, newState);
    this.state.value = newState;
  }

  getMcpConfigOverride(taskId: string): McpConfigOverride | undefined {
    return this.getTaskState(taskId)?.mcpConfigOverride;
  }

  async setMcpConfigOverride(
    taskId: string,
    mcpConfigOverride: McpConfigOverride,
  ): Promise<McpConfigOverride> {
    const existing = this.getTaskState(taskId) || {};
    logger.debug(
      `setMcpConfigOverride for task ${taskId}: ${JSON.stringify(mcpConfigOverride)}`,
    );
    await this.saveTaskState(taskId, { ...existing, mcpConfigOverride });
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

  getChangedFiles(taskId: string): TaskChangedFile[] {
    return this.getTaskState(taskId)?.changedFiles ?? [];
  }

  async setChangedFiles(
    taskId: string,
    changedFiles: TaskChangedFile[],
  ): Promise<void> {
    const existing = this.getTaskState(taskId) || {};
    logger.debug(
      `setChangedFiles for task ${taskId}: ${changedFiles.length} files`,
    );
    await this.saveTaskState(taskId, { ...existing, changedFiles });
  }

  /**
   * Get a computed signal for a specific task's changedFiles.
   * Used for ThreadSignal serialization.
   */
  getChangedFilesSignal(taskId: string) {
    return computed(() => this.state.value[taskId]?.changedFiles ?? []);
  }

  /**
   * Migrate changed files from global state (old storage) to task data store.
   * This handles migration from the previous storage format where each task's
   * changed files were stored in a separate global state key.
   */
  async migrateFromGlobalState(taskId: string): Promise<boolean> {
    const globalStateKey = `changed-file-store-${taskId}`;
    const globalStateData = this.context.globalState.get<{
      state?: { changedFiles?: TaskChangedFile[] };
    }>(globalStateKey);

    if (!globalStateData?.state?.changedFiles) {
      logger.trace(
        `No migration needed for ${taskId} - no global state data found`,
      );
      return false;
    }

    // Check if task data store already has changed files
    const existingFiles = this.getChangedFiles(taskId);
    if (existingFiles.length > 0) {
      logger.trace(
        `No migration needed for ${taskId} - task data store already has data`,
      );
      // Clean up old global state
      await this.context.globalState.update(globalStateKey, undefined);
      return false;
    }

    // Migrate data
    logger.info(
      `Migrating changed files for ${taskId} from global state to task data store`,
    );
    await this.setChangedFiles(taskId, globalStateData.state.changedFiles);

    // Clean up old global state
    await this.context.globalState.update(globalStateKey, undefined);
    logger.info(`Successfully migrated changed files for ${taskId}`);
    return true;
  }
}
