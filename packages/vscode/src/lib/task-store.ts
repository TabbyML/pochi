import { taskUpdated } from "@/lib/task-events";
import { getLogger } from "@getpochi/common";
import { signal } from "@preact/signals-core";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

type EncodedTask = {
  id: string;
  // unix timestamp in milliseconds
  updatedAt: number;
};

const logger = getLogger("TaskStore");

@injectable()
@singleton()
export class TaskStore implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private storageKey: string;
  tasks = signal<Record<string, EncodedTask>>({});

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {
    this.storageKey =
      context.extensionMode === vscode.ExtensionMode.Development
        ? "dev.tasks"
        : "tasks";
    this.loadTasks();

    this.disposables.push(
      taskUpdated.event(({ event }) => this.upsertTask(event as EncodedTask)),
    );
  }

  private loadTasks() {
    const tasks = this.context.globalState.get<Record<string, EncodedTask>>(
      this.storageKey,
      {},
    );

    const now = Date.now();
    const threeMonthsInMs = 90 * 24 * 60 * 60 * 1000;
    const cutoff = now - threeMonthsInMs;

    const validTasks: Record<string, EncodedTask> = {};
    let hasStaleTasks = false;

    for (const [id, task] of Object.entries(tasks)) {
      if (task.updatedAt > cutoff) {
        validTasks[id] = task;
      } else {
        logger.debug(
          `Removing stale task: ${id}, last updated at: ${new Date(task.updatedAt).toISOString()}`,
        );
        hasStaleTasks = true;
      }
    }

    if (hasStaleTasks) {
      this.context.globalState.update(this.storageKey, validTasks);
    }

    this.tasks.value = validTasks;
  }

  private saveTasks() {
    this.context.globalState.update(this.storageKey, this.tasks.value);
  }

  private upsertTask(task: EncodedTask) {
    const tasks = { ...this.tasks.value };
    tasks[task.id] = task;
    this.tasks.value = tasks;
    this.saveTasks();
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
