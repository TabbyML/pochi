import fs from "node:fs/promises";
import { isFileExists } from "@/lib/fs";
import { taskUpdated } from "@/lib/task-events";
import { getLogger } from "@getpochi/common";
import { removeTaskTranscripts } from "@getpochi/common/auto-memory/node";
import { getTaskDataDir } from "@getpochi/common/tool-utils";
import { signal } from "@preact/signals-core";
import { funnel } from "remeda";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import {
  type EncodedTask,
  TaskHistoryFile,
  sanitizeTask,
} from "./task-history-file";

const logger = getLogger("TaskHistoryStore");

@injectable()
@singleton()
export class TaskHistoryStore implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private disposed = false;
  private loading = true;
  private receivedDuringLoad = new Set<string>();
  private writeQueue: Promise<void> = Promise.resolve();
  private pendingUpdates: Record<string, EncodedTask> = {};
  private pendingEvictions: Record<string, EncodedTask> = {};
  private readonly file: TaskHistoryFile;
  private readonly initPromise: Promise<void>;
  tasks = signal<Record<string, EncodedTask>>({});

  constructor(
    @inject("vscode.ExtensionContext") context: vscode.ExtensionContext,
  ) {
    const storageKey =
      context.extensionMode === vscode.ExtensionMode.Development
        ? "dev.tasks"
        : "tasks";
    this.file = new TaskHistoryFile(
      vscode.Uri.joinPath(context.globalStorageUri, `${storageKey}.json`)
        .fsPath,
    );
    this.initPromise = this.loadTasks();
    this.disposables.push(
      taskUpdated.event(({ event }) => this.upsertTask(event as EncodedTask)),
    );
  }

  get ready() {
    return this.initPromise;
  }

  private async loadTasks() {
    try {
      const tasks = this.file.read();
      const now = Date.now();
      const threeMonthsCutoff = now - 90 * 24 * 60 * 60 * 1000;
      const oneWeekCutoff = now - 7 * 24 * 60 * 60 * 1000;
      const cwdPaths = new Set<string>();
      for (const task of Object.values(tasks)) {
        if (
          task.updatedAt > threeMonthsCutoff &&
          task.updatedAt <= oneWeekCutoff &&
          task.cwd
        )
          cwdPaths.add(task.cwd);
      }
      const cwdExists = new Map(
        await Promise.all(
          Array.from(
            cwdPaths,
            async (cwd) =>
              [cwd, await isFileExists(vscode.Uri.file(cwd))] as const,
          ),
        ),
      );
      if (this.disposed) return;
      const validTasks: Record<string, EncodedTask> = {};
      for (const [id, task] of Object.entries(tasks)) {
        if (
          task.updatedAt <= threeMonthsCutoff ||
          (task.updatedAt <= oneWeekCutoff &&
            task.cwd &&
            cwdExists.get(task.cwd) === false)
        ) {
          if (!this.receivedDuringLoad.has(id))
            this.pendingEvictions[id] = task;
        } else {
          validTasks[id] = task;
        }
      }
      // Events received during initialization take precedence over the cache.
      this.tasks.value = {
        ...validTasks,
        ...this.tasks.value,
        ...this.pendingUpdates,
      };
      if (Object.keys(this.pendingEvictions).length)
        await this.writeTasksToDisk();
    } catch (error) {
      logger.error("Failed to load task history", error);
    } finally {
      this.loading = false;
      this.receivedDuringLoad.clear();
    }
  }

  private commit(): string[] {
    if (
      !Object.keys(this.pendingUpdates).length &&
      !Object.keys(this.pendingEvictions).length
    )
      return [];
    const { tasks, evicted } = this.file.update(
      this.pendingUpdates,
      this.pendingEvictions,
    );
    this.pendingUpdates = {};
    this.pendingEvictions = {};
    this.tasks.value = tasks;
    return evicted;
  }

  private writeTasksToDisk() {
    this.writeQueue = this.writeQueue.then(async () => {
      if (this.disposed) return;
      try {
        const evicted = this.commit();
        // Retention of auxiliary data follows a successful cache eviction.
        // Failed or cancelled saves must not remove those files.
        if (!evicted.length || this.disposed) return;
        const inactive = evicted.filter((id) => !this.tasks.value[id]);
        await Promise.allSettled([
          ...inactive.map((id) =>
            fs.rm(getTaskDataDir(id), { recursive: true, force: true }),
          ),
          removeTaskTranscripts(inactive),
        ]);
      } catch (error) {
        logger.error("Failed to save task history", error);
      }
    });
    return this.writeQueue;
  }

  private saveTasks = funnel(() => this.writeTasksToDisk(), {
    minGapMs: 5000,
    triggerAt: "both",
  });

  private upsertTask(task: EncodedTask) {
    if (this.disposed) return;
    const update = sanitizeTask(task);
    if (this.loading) this.receivedDuringLoad.add(task.id);
    this.pendingUpdates[task.id] = update;
    delete this.pendingEvictions[task.id];
    this.tasks.value = { ...this.tasks.value, [task.id]: update };
    this.saveTasks.call();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.saveTasks.cancel();
    try {
      this.commit();
    } catch (error) {
      logger.error("Failed to flush task history", error);
    }
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables = [];
  }
}
