import { taskUpdated } from "@/lib/task-events";
import type { Task } from "@getpochi/livekit";
import { signal } from "@preact/signals-core";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

@injectable()
@singleton()
export class TaskStore implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private storageKey: string;
  tasks = signal<Record<string, Task>>({});

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
      taskUpdated.event(({ event }) => this.upsertTask(event as Task)),
    );
  }

  private loadTasks() {
    const tasks = this.context.globalState.get<Record<string, Task>>(
      this.storageKey,
      {},
    );
    this.tasks.value = tasks;
  }

  private saveTasks() {
    this.context.globalState.update(this.storageKey, this.tasks.value);
  }

  private upsertTask(task: Task) {
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
