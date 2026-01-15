import { getLogger } from "@getpochi/common";
import type { McpConfigOverride } from "@getpochi/common/vscode-webui-bridge";
import { computed, signal } from "@preact/signals-core";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

type TaskStateData = {
  mcpConfigOverride?: McpConfigOverride;
};

const logger = getLogger("TaskState");

@injectable()
@singleton()
export class TaskState {
  private readonly storageKeyPrefix = "taskState.";

  state = signal<Record<string, TaskStateData>>({});

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {}

  private getStorageKey(taskId: string): string {
    return `${this.storageKeyPrefix}${taskId}`;
  }

  private getTaskState(taskId: string): TaskStateData | undefined {
    // Try cache first
    if (this.state.value[taskId]) {
      return this.state.value[taskId];
    }
    // Load from globalState
    const data = this.context.globalState.get<TaskStateData>(
      this.getStorageKey(taskId),
    );
    if (data) {
      this.state.value = { ...this.state.value, [taskId]: data };
    }
    return data;
  }

  private async saveTaskState(
    taskId: string,
    data: TaskStateData,
  ): Promise<void> {
    await this.context.globalState.update(this.getStorageKey(taskId), data);
    this.state.value = { ...this.state.value, [taskId]: data };
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
}
