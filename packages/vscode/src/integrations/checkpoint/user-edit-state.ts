// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "@/lib/workspace-scoped";
import { getLogger } from "@getpochi/common";
import type { FileDiff } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { funnel } from "remeda";
import * as runExclusive from "run-exclusive";
import { Lifecycle, injectable, scoped } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiTaskState } from "../editor/pochi-task-state";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { CheckpointService } from "./checkpoint-service";

const logger = getLogger("UserEditState");

@scoped(Lifecycle.ContainerScoped)
@injectable()
export class UserEditState implements vscode.Disposable {
  edits = signal<Record<string, FileDiff[]>>({});

  // Mapping from task uid to hash.
  private trackingTasks = new Map<string, string | undefined>();
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly workspaceScope: WorkspaceScope,
    private readonly checkpointService: CheckpointService,
    private readonly pochiTaskState: PochiTaskState,
  ) {
    this.setupEventListeners();
  }

  private get cwd() {
    return this.workspaceScope.cwd;
  }

  private setupEventListeners() {
    if (!this.cwd) {
      return;
    }
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.cwd, "**/*"),
    );
    this.disposables.push(watcher);
    this.disposables.push(
      watcher.onDidCreate((e) => {
        logger.trace(`File created, triggering update, ${e.fsPath}`);
        this.triggerUpdate.call();
      }),
    );
    this.disposables.push(
      watcher.onDidDelete((e) => {
        logger.trace(`File deleted, triggering update, ${e.fsPath}`);
        this.triggerUpdate.call();
      }),
    );
    this.disposables.push(
      watcher.onDidChange((e) => {
        logger.trace(`File changed, triggering update, ${e.fsPath}`);
        this.triggerUpdate.call();
      }),
    );

    // Watch active pochi tasks to maintain tracking tasks state.
    this.disposables.push({
      dispose: this.pochiTaskState.state.subscribe((tasks) => {
        logger.trace("Received tasks update", {
          tasksCount: Object.keys(tasks).length,
          currentCwd: this.cwd,
        });

        const newEdits = { ...this.edits.value };
        for (const uid of this.trackingTasks.keys()) {
          if (!tasks[uid] || !tasks[uid].active) {
            this.trackingTasks.delete(uid);
            delete newEdits[uid];
          }
        }

        const isDeleted =
          Object.keys(newEdits).length < Object.keys(this.edits.value).length;

        let isDirty = false;
        for (const [uid, task] of Object.entries(tasks)) {
          const { cwd, lastCheckpointHash: hash, active } = task;
          if (active && cwd === this.cwd) {
            logger.trace(
              `Updating edits for task ${uid} with hash ${hash}, original: ${this.trackingTasks.get(uid)}`,
            );
            if (this.trackingTasks.get(uid) !== hash) {
              logger.trace(`Adding/updating tracking task ${uid}`, { hash });
              this.trackingTasks.set(uid, hash);
              isDirty = true;
            }
          }
        }

        if (isDirty) {
          this.triggerUpdate.call();
        } else if (isDeleted) {
          this.edits.value = newEdits;
        }
      }),
    });

    this.disposables.push({
      dispose: this.checkpointService.latestCheckpoint.subscribe(() => {
        this.triggerUpdate.call();
      }),
    });
  }

  private triggerUpdate = funnel(() => this.updateEdits(), {
    minGapMs: 1000,
    triggerAt: "both",
  });

  private updateEdits = runExclusive.build(async () => {
    if (this.trackingTasks.size === 0) {
      return;
    }

    const nextEdits = { ...this.edits.value };

    for (const [uid, hash] of this.trackingTasks.entries()) {
      try {
        const latestCheckpoint = this.checkpointService.latestCheckpoint.value;
        logger.trace(
          `Updating edits for task ${uid} with hash ${hash}, latest ${latestCheckpoint}`,
        );
        // If the checkpoint hash is not the latest, we cannot guarantee
        // the diffs are accurate, so we clear them.
        if (hash !== latestCheckpoint) {
          nextEdits[uid] = [];
        } else {
          const diffs = await this.checkpointService.getCheckpointFileEdits(
            hash,
            undefined,
            {
              maxSizeLimit: 20 * 1024,
              inlineDiff: true,
            },
          );

          if (this.trackingTasks.has(uid)) {
            logger.trace("set diffs for task", uid, hash);
            nextEdits[uid] = diffs ?? [];
          }
        }
      } catch (error) {
        logger.error(`Failed to update user edits for hash ${hash}`, error);
      }
    }

    // Clean up any hashes that are no longer tracked
    for (const key of Object.keys(nextEdits)) {
      if (!this.trackingTasks.has(key)) {
        delete nextEdits[key];
      }
    }

    logger.trace(
      "do update userEdits",
      Object.keys(nextEdits).length,
      nextEdits[Object.keys(nextEdits)[0]].map((x) => ({
        filepath: x.filepath,
        added: x.added,
        removed: x.removed,
      })),
    );

    this.edits.value = nextEdits;
  });

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
