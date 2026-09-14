import { parseBackgroundJobId } from "@getpochi/common";
import {
  type BackgroundJobNotification,
  getSubAgentTaskId,
} from "@getpochi/common";
import type { BackgroundCommands } from "@getpochi/common/vscode-webui-bridge";
import { defaultCatalog as catalog } from "../livestore";
import type { LiveKitStore, Message, Task } from "../types";
import { buildBackgroundJobList } from "./state";

/** Platform code owns processes/terminals; LiveKit owns job routing and task state. */
export interface BackgroundCommandController {
  kill(backgroundJobId: string): Promise<void>;
}

export interface BackgroundJobManagerOptions {
  taskId: string;
  store: LiveKitStore | undefined;
  commands: BackgroundCommandController;
}

export class BackgroundJobManager {
  constructor(private readonly options: BackgroundJobManagerOptions) {}

  getJobs(options: {
    messages: readonly Message[];
    notifications: readonly BackgroundJobNotification[];
    backgroundCommands: BackgroundCommands | undefined;
    subTasks?: readonly Task[];
  }) {
    const { store, taskId } = this.options;
    return buildBackgroundJobList({
      ...options,
      subTasks:
        options.subTasks ??
        store?.query(catalog.queries.makeSubTaskQuery(taskId)) ??
        [],
    });
  }

  async kill(backgroundJobId: string): Promise<{ success: true }> {
    if (typeof backgroundJobId !== "string" || !backgroundJobId) {
      throw new Error("A background job ID is required.");
    }
    const { store, taskId, commands } = this.options;
    if (parseBackgroundJobId(backgroundJobId) === "task") {
      if (!store)
        throw new Error("Background subagent store is not available.");
      const subTaskId = getSubAgentTaskId(backgroundJobId);
      const task = subTaskId
        ? store.query(catalog.queries.makeTaskQuery(subTaskId))
        : undefined;
      if (!task || !task.background || task.parentId !== taskId) {
        throw new Error(
          `Background job with ID "${backgroundJobId}" not found.`,
        );
      }
      if (task.status !== "completed" && task.status !== "failed") {
        // Persist cancellation so every executor observes it, including after reload.
        store.commit(
          catalog.events.taskFailed({
            id: task.id,
            error: { kind: "AbortError", message: "Stopped by user." },
            updatedAt: new Date(),
          }),
        );
      }
    } else {
      await commands.kill(backgroundJobId);
    }
    return { success: true };
  }
}
