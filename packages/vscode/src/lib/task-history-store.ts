import { TextDecoder, TextEncoder } from "node:util";
import { isFileExists } from "@/lib/fs";
import { taskUpdated } from "@/lib/task-events";
import { getLogger } from "@getpochi/common";
import { signal } from "@preact/signals-core";
import { funnel } from "remeda";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

type EncodedTask = {
  id: string;
  parentId: string | null;
  shareId: string | null;
  // unix timestamp in milliseconds
  updatedAt: number;
  cwd?: string | null;
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
    const threeMonthsCutoff = now - threeMonthsInMs;

    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
    const oneWeekCutoff = now - oneWeekInMs;

    // Collect unique cwd paths that need existence check (tasks older than 1 week with cwd)
    const cwdPathsToCheck = new Set<string>();
    for (const task of Object.values(tasks)) {
      if (
        task.updatedAt > threeMonthsCutoff &&
        task.updatedAt <= oneWeekCutoff &&
        task.cwd
      ) {
        cwdPathsToCheck.add(task.cwd);
      }
    }

    // Check all paths in parallel and cache results
    const cwdExistsMap = new Map<string, boolean>();
    await Promise.all(
      Array.from(cwdPathsToCheck).map(async (cwd) => {
        const exists = await isFileExists(vscode.Uri.file(cwd));
        cwdExistsMap.set(cwd, exists);
      }),
    );

    const validTasks: Record<string, EncodedTask> = {};
    let hasStaleTasks = false;

    for (const [id, task] of Object.entries(tasks)) {
      // Remove tasks older than 3 months
      if (task.updatedAt <= threeMonthsCutoff) {
        logger.debug(
          `Removing stale task: ${id}, last updated at: ${new Date(task.updatedAt).toISOString()}`,
        );
        hasStaleTasks = true;
        continue;
      }

      // Remove tasks older than 1 week if their worktree is deleted
      if (task.updatedAt <= oneWeekCutoff && task.cwd) {
        const worktreeExists = cwdExistsMap.get(task.cwd) ?? true;
        if (!worktreeExists) {
          logger.debug(
            `Removing task with deleted worktree: ${id}, cwd: ${task.cwd}, last updated at: ${new Date(task.updatedAt).toISOString()}`,
          );
          hasStaleTasks = true;
          continue;
        }
      }

      validTasks[id] = task;
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
