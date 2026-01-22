import { getLogger } from "@getpochi/common";
import type { McpConfigOverride } from "@getpochi/common/vscode-webui-bridge";
import { computed, signal } from "@preact/signals-core";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

type TaskStateData = {
  mcpConfigOverride?: McpConfigOverride;
};

const logger = getLogger("TaskDataStore");

@injectable()
@singleton()
export class TaskDataStore {
  private readonly storageKey = "task-state";

  state = signal<Record<string, TaskStateData>>({});

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {
    this.state.value = this.context.globalState.get(this.storageKey, {});
  }

  private getTaskState(taskId: string): TaskStateData | undefined {
    return this.state.value[taskId];
  }

  private async saveTaskState(
    taskId: string,
    data: TaskStateData,
  ): Promise<void> {
    const newState = { ...this.state.value, [taskId]: data };
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
}
