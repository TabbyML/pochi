import { getLogger } from "@getpochi/common";
import type {
  ChangedFileContent,
  TaskChangedFile,
} from "@getpochi/common/vscode-webui-bridge";
import { type ReadonlySignal, computed } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";
import type { CheckpointService } from "../integrations/checkpoint/checkpoint-service";
import { showDiffChanges } from "../integrations/editor/diff-changes-editor";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { TaskActivityTracker } from "../integrations/editor/task-activity-tracker";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { TaskDataStore } from "./task-data-store";
import { taskFileChanged } from "./task-events";

const logger = getLogger("TaskChangedFilesManager");

@injectable()
@singleton()
export class TaskChangedFilesManager {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly taskDataStore: TaskDataStore,
    private readonly taskActivityTracker: TaskActivityTracker,
  ) {
    // Listen for file change events
    this.disposables.push(
      taskFileChanged.event(({ taskId, filepath, content }) => {
        this.handleFileChange(taskId, filepath, content);
      }),
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  /**
   * Get the changed files for a task.
   */
  getChangedFiles(taskId: string): TaskChangedFile[] {
    return this.taskDataStore.getChangedFiles(taskId);
  }

  /**
   * Set the changed files for a task.
   */
  async setChangedFiles(
    taskId: string,
    changedFiles: TaskChangedFile[],
  ): Promise<void> {
    await this.taskDataStore.setChangedFiles(taskId, changedFiles);
  }

  /**
   * Get a computed signal for a specific task's changed files.
   */
  getChangedFilesSignal(taskId: string) {
    return this.taskDataStore.getChangedFilesSignal(taskId);
  }

  /**
   * Get a computed signal for visible (pending) changed files for a task.
   */
  getVisibleChangedFilesSignal(
    taskId: string,
  ): ReadonlySignal<TaskChangedFile[]> {
    return computed(() => {
      const changedFiles = this.taskDataStore.getChangedFilesSignal(taskId);
      return changedFiles.value.filter((f) => f.state === "pending");
    });
  }

  /**
   * Update changed files with new file paths from a tool call.
   * This is called after a tool modifies files.
   * @param taskId The task ID
   * @param files The file paths to add
   * @param checkpoint The checkpoint commit hash
   * @param checkpointService The checkpoint service instance (container-scoped)
   */
  async updateChangedFiles(
    taskId: string,
    files: string[],
    checkpoint: string,
    checkpointService: CheckpointService,
  ): Promise<void> {
    const currentFiles = this.getChangedFiles(taskId);
    const updatedChangedFiles = [...currentFiles];

    for (const filePath of files) {
      const currentFile = currentFiles.find((f) => f.filepath === filePath);

      // first time seeing this file change
      if (!currentFile) {
        updatedChangedFiles.push({
          filepath: filePath,
          added: 0,
          removed: 0,
          content: { type: "checkpoint", commit: checkpoint },
          deleted: false,
          state: "pending",
        });
      }
    }

    const diffResult =
      await checkpointService.diffChangedFiles(updatedChangedFiles);
    logger.trace(`setChangedFiles ${taskId}, ${JSON.stringify(diffResult)}`);
    await this.setChangedFiles(taskId, diffResult);
  }

  /**
   * Accept changed files (mark as accepted).
   * @param taskId The task ID
   * @param content The content to store with the accepted files
   * @param filepath Optional specific file path. If not provided, accepts all files.
   */
  async acceptChangedFile(
    taskId: string,
    content: ChangedFileContent,
    filepath?: string,
  ): Promise<void> {
    const currentFiles = this.getChangedFiles(taskId);

    const updatedFiles = filepath
      ? currentFiles.map((f) =>
          f.filepath === filepath
            ? { ...f, state: "accepted" as const, content }
            : f,
        )
      : currentFiles.map((f) => ({
          ...f,
          state: "accepted" as const,
          content,
        }));

    await this.setChangedFiles(taskId, updatedFiles);
  }

  /**
   * Revert changed files (restore from checkpoint and mark as reverted).
   * @param taskId The task ID
   * @param filepath Optional specific file path. If not provided, reverts all files.
   * @param checkpointService The checkpoint service instance (container-scoped)
   */
  async revertChangedFile(
    taskId: string,
    filepath: string | undefined,
    checkpointService: CheckpointService,
  ): Promise<void> {
    const currentFiles = this.getChangedFiles(taskId);

    const targetFiles = filepath
      ? currentFiles.filter((f) => f.filepath === filepath)
      : currentFiles;

    await checkpointService.restoreChangedFiles(targetFiles);

    const updatedFiles = filepath
      ? currentFiles.map((f) =>
          f.filepath === filepath ? { ...f, state: "reverted" as const } : f,
        )
      : currentFiles.map((f) => ({
          ...f,
          state: "reverted" as const,
        }));

    await this.setChangedFiles(taskId, updatedFiles);
  }

  /**
   * Update the content of a changed file (e.g., when user edits the file).
   */
  async updateChangedFileContent(
    taskId: string,
    filepath: string,
    content: string,
  ): Promise<void> {
    const currentFiles = this.getChangedFiles(taskId);

    const updatedFiles = currentFiles.map((f) =>
      f.filepath === filepath
        ? {
            ...f,
            state: "userEdited" as const,
            content: { type: "text" as const, text: content },
          }
        : f,
    );

    await this.setChangedFiles(taskId, updatedFiles);
  }

  /**
   * Handle file change event - updates changed file content if the file is being tracked.
   * This is called when a file is saved by the user (not during task execution).
   * @param taskId The task ID
   * @param filepath The path of the changed file
   * @param content The new content
   */
  private async handleFileChange(
    taskId: string,
    filepath: string,
    content: string,
  ): Promise<void> {
    // Skip if task is currently executing
    const taskState = this.taskActivityTracker.state.value[taskId];
    if (taskState?.running) {
      logger.trace(
        `Skipping file change for ${filepath} - task ${taskId} is executing`,
      );
      return;
    }

    const currentFiles = this.getChangedFiles(taskId);
    const isTracked = currentFiles.some((cf) => cf.filepath === filepath);

    if (isTracked) {
      await this.updateChangedFileContent(taskId, filepath, content);
    }
  }

  /**
   * Migrate changed files from global state (old storage) to task data store.
   */
  async migrateFromGlobalState(taskId: string): Promise<boolean> {
    return this.taskDataStore.migrateFromGlobalState(taskId);
  }

  /**
   * Show changed files in a diff view.
   * @param taskId The task ID
   * @param cwd The current working directory
   * @param filepath Optional specific file path. If not provided, shows all visible changed files.
   * @param checkpointService The checkpoint service instance (container-scoped)
   * @returns A promise that resolves to true if the diff was shown, false otherwise.
   */
  async showChangedFiles(
    taskId: string,
    cwd: string,
    filepath: string | undefined,
    checkpointService: CheckpointService,
  ): Promise<boolean> {
    const visibleChangedFiles = this.getVisibleChangedFilesSignal(taskId).value;
    if (visibleChangedFiles.length === 0) {
      return false;
    }

    const files = filepath
      ? visibleChangedFiles.filter((f) => f.filepath === filepath)
      : visibleChangedFiles;

    const changes = await checkpointService.getChangedFilesChanges(files);

    const title = filepath ? `Changes in ${filepath}` : "Changed Files";
    return await showDiffChanges(changes, title, cwd, true);
  }
}
