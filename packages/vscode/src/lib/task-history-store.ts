import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { TextDecoder, TextEncoder } from "node:util";
import { isFileExists } from "@/lib/fs";
import { taskUpdated } from "@/lib/task-events";
import { getLogger } from "@getpochi/common";
import { removeTaskTranscripts } from "@getpochi/common/auto-memory/node";
import { getTaskDataDir } from "@getpochi/common/tool-utils";
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
  title?: string | null;
  // JSON encoded `TaskError`. Kept small on purpose, see `sanitizeTask`.
  error?: string | null;
  // Used to scope tasks to the current repository.
  git?: {
    worktree?: { gitdir?: string } | null;
  } | null;
};

const logger = getLogger("TaskHistoryStore");

/**
 * The whole file is rewritten on every update, so a single bloated row slows
 * down every write and risks leaving a partially written file behind. Errors are
 * the only field that can grow without bound (older clients stored the full
 * request body of failed API calls), so they are capped defensively here.
 */
const MaxEncodedTaskErrorChars = 8 * 1024;

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

  /**
   * Temp file used for atomic writes. Scoped to the process so that concurrent
   * windows never write to the same temp file.
   */
  private get tempFileUri(): vscode.Uri {
    return vscode.Uri.joinPath(
      this.context.globalStorageUri,
      `${this.storageKey}.${process.pid}.tmp.json`,
    );
  }

  private async loadTasks() {
    const { tasks } = await this.readTasksFromDisk();

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
    const removedTaskIds: string[] = [];

    for (const [id, task] of Object.entries(tasks)) {
      // Remove tasks older than 3 months
      if (task.updatedAt <= threeMonthsCutoff) {
        logger.debug(
          `Removing stale task: ${id}, last updated at: ${new Date(task.updatedAt).toISOString()}`,
        );
        hasStaleTasks = true;
        removedTaskIds.push(id);
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
          removedTaskIds.push(id);
          continue;
        }
      }

      validTasks[id] = sanitizeTask(task);
    }

    this.tasks.value = validTasks;

    if (hasStaleTasks) {
      // Retention deletes must not be merged back from disk.
      await this.writeTasksToDisk({ merge: false });
      await Promise.allSettled([
        ...removedTaskIds.map((id) =>
          fs.rm(getTaskDataDir(id), { recursive: true, force: true }),
        ),
        // Drop any orphaned auto-memory transcripts for these tasks.
        removeTaskTranscripts(removedTaskIds),
      ]);
    }
  }

  private async readTasksFromDisk(): Promise<{
    tasks: Record<string, EncodedTask>;
    corrupted: boolean;
  }> {
    let content: Uint8Array;
    try {
      content = await vscode.workspace.fs.readFile(this.fileUri);
    } catch {
      // Ignore error if file doesn't exist
      return { tasks: {}, corrupted: false };
    }

    try {
      return {
        tasks: parseTasks(new TextDecoder().decode(content)),
        corrupted: false,
      };
    } catch (error) {
      logger.error(
        `Task history file is unreadable: ${this.fileUri.fsPath}`,
        error,
      );
      await this.backupCorruptedFile();
      return { tasks: {}, corrupted: true };
    }
  }

  /**
   * Keep a copy of an unparsable file instead of silently overwriting it, so
   * that the history can be recovered manually.
   */
  private async backupCorruptedFile() {
    const backupUri = vscode.Uri.joinPath(
      this.context.globalStorageUri,
      `${this.storageKey}.corrupted-${Date.now()}.json`,
    );
    try {
      await vscode.workspace.fs.rename(this.fileUri, backupUri, {
        overwrite: true,
      });
      logger.info(`Corrupted task history moved to ${backupUri.fsPath}`);
    } catch (error) {
      logger.error("Failed to back up corrupted task history", error);
    }
  }

  /**
   * Every window keeps its own in-memory snapshot, loaded once at startup, and
   * writes the whole file. Merging with the current file contents keeps a stale
   * snapshot from erasing tasks created by another window.
   */
  private mergeWithDisk(disk: Record<string, EncodedTask>) {
    const local = this.tasks.value;
    let changed = false;
    const merged = { ...local };
    for (const [id, task] of Object.entries(disk)) {
      const current = merged[id];
      if (!current || (task.updatedAt ?? 0) > (current.updatedAt ?? 0)) {
        merged[id] = sanitizeTask(task);
        changed = true;
      }
    }
    if (changed) {
      this.tasks.value = merged;
    }
    return this.tasks.value;
  }

  private async writeTasksToDisk(options?: { merge?: boolean }) {
    try {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      if (options?.merge !== false) {
        const { tasks, corrupted } = await this.readTasksFromDisk();
        if (!corrupted) {
          this.mergeWithDisk(tasks);
        }
      }
      const content = new TextEncoder().encode(
        JSON.stringify(this.tasks.value),
      );
      // Write to a temp file and rename: a truncated write (window closed
      // mid-write, crash, full disk) would otherwise leave invalid JSON behind
      // and drop the entire task history.
      await vscode.workspace.fs.writeFile(this.tempFileUri, content);
      await vscode.workspace.fs.rename(this.tempFileUri, this.fileUri, {
        overwrite: true,
      });
    } catch (err) {
      logger.error("Failed to save tasks", err);
    }
  }

  /**
   * `dispose` cannot await async work, so the final write has to be sync,
   * otherwise the last batch of updates is lost when the window closes.
   */
  private writeTasksToDiskSync() {
    try {
      mkdirSync(this.context.globalStorageUri.fsPath, { recursive: true });
      try {
        this.mergeWithDisk(
          parseTasks(readFileSync(this.fileUri.fsPath, "utf8")),
        );
      } catch {
        // Missing or unreadable file: keep the in-memory snapshot as is.
      }
      const tempPath = this.tempFileUri.fsPath;
      writeFileSync(tempPath, JSON.stringify(this.tasks.value));
      renameSync(tempPath, this.fileUri.fsPath);
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
    tasks[task.id] = sanitizeTask(task);
    this.tasks.value = tasks;
    this.saveTasks.call();
  }

  dispose() {
    this.saveTasks.cancel();
    this.writeTasksToDiskSync();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

function parseTasks(content: string): Record<string, EncodedTask> {
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Task history is not an object");
  }
  const tasks: Record<string, EncodedTask> = {};
  for (const [id, task] of Object.entries(parsed as Record<string, unknown>)) {
    if (!task || typeof task !== "object") continue;
    tasks[id] = task as EncodedTask;
  }
  return tasks;
}

function sanitizeTask(task: EncodedTask): EncodedTask {
  const { error } = task;
  if (typeof error !== "string" || error.length <= MaxEncodedTaskErrorChars) {
    return task;
  }
  return { ...task, error: summarizeEncodedTaskError(error) };
}

/**
 * Replaces an oversized encoded `TaskError` with an equivalent that still
 * decodes against the `TaskError` schema.
 */
function summarizeEncodedTaskError(encoded: string): string {
  const message = `Error details dropped (${encoded.length} characters).`;
  try {
    const parsed = JSON.parse(encoded) as Record<string, unknown>;
    if (parsed.kind === "APICallError") {
      return JSON.stringify({
        kind: "APICallError",
        isRetryable: parsed.isRetryable === true,
        message: truncate(parsed.message, message),
        requestBodyValues: {
          omitted: "requestBodyValues too large",
          size: encoded.length,
        },
      });
    }
    return JSON.stringify({
      kind: parsed.kind === "AbortError" ? "AbortError" : "InternalError",
      message: truncate(parsed.message, message),
    });
  } catch {
    return JSON.stringify({ kind: "InternalError", message });
  }
}

function truncate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (value.length <= 4_000) return value;
  return `${value.slice(0, 4_000)}… [truncated]`;
}
