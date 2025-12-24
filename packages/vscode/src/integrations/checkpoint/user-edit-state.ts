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
  private trackingTasks = new Map<string, string>();
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly workspaceScope: WorkspaceScope,
    private readonly checkpointService: CheckpointService,
    private readonly pochiTaskState: PochiTaskState,
  ) {
    this.setupEventListeners();
  }

  private get cwd() {
    if (!this.workspaceScope.cwd) {
      throw new Error("No workspace folder found. Please open a workspace.");
    }
    return this.workspaceScope.cwd;
  }

  private setupEventListeners() {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.cwd, "**/*"),
    );
    this.disposables.push(watcher);
    this.disposables.push(
      watcher.onDidCreate((e) => {
        logger.info(`File created, triggering update, ${e.fsPath}`);
        this.triggerUpdate.call();
      }),
    );
    this.disposables.push(
      watcher.onDidDelete((e) => {
        logger.info(`File deleted, triggering update, ${e.fsPath}`);
        this.triggerUpdate.call();
      }),
    );
    this.disposables.push(
      watcher.onDidChange((e) => {
        logger.info(`File changed, triggering update, ${e.fsPath}`);
        this.triggerUpdate.call();
      }),
    );

    // Watch active pochi tasks to maintain tracking tasks state.
    this.disposables.push({
      dispose: this.pochiTaskState.state.subscribe((tasks) => {
        logger.debug("Received tasks update", {
          tasksCount: Object.keys(tasks).length,
          currentCwd: this.cwd,
        });

        const newEdits = { ...this.edits.value };
        for (const uid of this.trackingTasks.keys()) {
          if (!tasks[uid] || !tasks[uid].active) {
            logger.debug(`Removing tracking task ${uid}`, {
              exists: !!tasks[uid],
              active: tasks[uid]?.active,
            });
            this.trackingTasks.delete(uid);
            delete newEdits[uid];
          }
        }

        const isDeleted =
          Object.keys(newEdits).length < Object.keys(this.edits.value).length;

        let isDirty = false;
        for (const [uid, task] of Object.entries(tasks)) {
          const { cwd, lastCheckpointHash: hash, active, running } = task;
          logger.debug(`Checking task ${uid}`, {
            active,
            cwd,
            running,
            hash: hash ? "present" : "missing",
            cwdMatch: cwd === this.cwd,
          });

          if (active && cwd === this.cwd && hash) {
            if (this.trackingTasks.get(uid) !== hash) {
              logger.info(`Adding/updating tracking task ${uid}`, { hash });
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
    logger.info("call updateEdits", this.trackingTasks.size);
    if (this.trackingTasks.size === 0) {
      return;
    }

    const nextEdits = { ...this.edits.value };

    for (const [uid, hash] of this.trackingTasks.entries()) {
      logger.info("get diff from trackingTasks", uid, hash);

      try {
        if (hash !== this.checkpointService.latestCheckpoint.value) {
          // If the checkpoint hash is not the latest, we cannot guarantee
          // the diffs are accurate, so we clear them.
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
          logger.info(
            "diffs result: ",
            diffs?.map((x) => ({
              filepath: x.filepath,
              added: x.added,
              removed: x.removed,
            })),
          );
          if (this.trackingTasks.has(uid) && diffs) {
            logger.info("set diffs for task", uid, hash);
            nextEdits[uid] = diffs;
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

    logger.info(
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
