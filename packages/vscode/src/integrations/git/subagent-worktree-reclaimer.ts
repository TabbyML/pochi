// biome-ignore lint/style/useImportType: needed for dependency injection
import { TaskDataStore } from "@/lib/task-data-store";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "@/lib/workspace-scoped";
import { getLogger, toErrorMessage } from "@getpochi/common";
import { removeSubagentWorktrees } from "@getpochi/common/tool-utils";
import { effect } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

const logger = getLogger("SubagentWorktreeReclaimer");

/**
 * Discards the isolated worktrees of subagents, changes included, once their
 * parent task is archived. Runs whenever a task gets archived and once at
 * startup, which also covers archives made in other windows and earlier
 * failed attempts.
 */
@injectable()
@singleton()
export class SubagentWorktreeReclaimer implements vscode.Disposable {
  private archived = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private readonly disposeEffect: (() => void) | undefined;

  constructor(workspaceScope: WorkspaceScope, taskDataStore: TaskDataStore) {
    const cwd = workspaceScope.cwd;
    if (!cwd) return;
    const archivedSignal = taskDataStore.getArchivedSignal();
    this.disposeEffect = effect(() => {
      const archived = Object.entries(archivedSignal.value)
        .filter(([, value]) => value)
        .map(([taskId]) => taskId);
      const hasNew = archived.some((taskId) => !this.archived.has(taskId));
      this.archived = new Set(archived);
      if (hasNew) this.reclaim(cwd);
    });
  }

  /** Settles once all scheduled reclaims have finished. */
  get idle(): Promise<void> {
    return this.queue;
  }

  private reclaim(cwd: string) {
    this.queue = this.queue.then(async () => {
      if (this.disposed) return;
      try {
        // Reads the archived set when the run starts, so a task unarchived in
        // the meantime keeps its subagent worktrees.
        const removed = await removeSubagentWorktrees(cwd, (parentTaskId) =>
          this.archived.has(parentTaskId),
        );
        for (const worktreePath of removed) {
          logger.info(
            `Removed the subagent worktree ${worktreePath} of an archived task.`,
          );
        }
      } catch (error) {
        logger.warn(
          `Failed to remove subagent worktrees: ${toErrorMessage(error)}`,
        );
      }
    });
  }

  dispose() {
    this.disposed = true;
    this.disposeEffect?.();
  }
}
