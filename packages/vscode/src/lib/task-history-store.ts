import { TextDecoder, TextEncoder } from "node:util";
import { taskUpdated } from "@/lib/task-events";
import { getLogger } from "@getpochi/common";
import { signal } from "@preact/signals-core";
import { funnel } from "remeda";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

type EncodedTask = {
  id: string;
  // unix timestamp in milliseconds
  updatedAt: number;
};

const logger = getLogger("TaskHistoryStore");

@injectable()
@singleton()
export class TaskHistoryStore implements vscode.Disposable {
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
    this.initPromise = this.loadTasks();

    this.disposables.push(
      taskUpdated.event(({ event }) => this.upsertTask(event as EncodedTask)),
    );

    this.disposables.push({
      dispose: () => this.saveTasks.flush(),
    });
  }

  private initPromise: Promise<void>;

  get ready() {
    return this.initPromise;
  }

  private get fileUri(): vscode.Uri {
    return vscode.Uri.joinPath(
      this.context.globalStorageUri,
      `${this.storageKey}.json`,
    );
  }

  private async loadTasks() {
    let tasks: Record<string, EncodedTask> = {};

    try {
      const content = await vscode.workspace.fs.readFile(this.fileUri);
      tasks = JSON.parse(new TextDecoder().decode(content));
    } catch (error) {
      // Ignore error if file doesn't exist
    }

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

    this.tasks.value = validTasks;

    if (hasStaleTasks) {
      await this.writeTasksToDisk();
    }
  }

  private async writeTasksToDisk() {
    try {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      const content = new TextEncoder().encode(
        JSON.stringify(this.tasks.value),
      );
      await vscode.workspace.fs.writeFile(this.fileUri, content);
    } catch (err) {
      logger.error("Failed to save tasks", err);
    }
  }

  private saveTasks = funnel(() => this.writeTasksToDisk(), {
    minGapMs: 5000,
    triggerAt: "both",
  });

  private upsertTask(task: EncodedTask) {
    const tasks = { ...this.tasks.value };
    tasks[task.id] = task;
    this.tasks.value = tasks;
    this.saveTasks.call();
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
