import * as path from "node:path";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "@/lib/workspace-scoped";
import { getLogger } from "@getpochi/common";
import type { FileDiff } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { funnel } from "remeda";
import * as runExclusive from "run-exclusive";
import { Lifecycle, inject, injectable, scoped } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { TaskActivityTracker } from "../editor/task-activity-tracker";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitState } from "../git/git-state";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { CheckpointService } from "./checkpoint-service";

const logger = getLogger("UserEditState");
const branchBaselinesStateKeyPrefix = "pochi.userEditState.branchBaselines";

interface BranchBaseline {
  taskCheckpoint: string | undefined;
  baseline: string;
}

@scoped(Lifecycle.ContainerScoped)
@injectable()
export class UserEditState implements vscode.Disposable {
  edits = signal<Record<string, FileDiff[]>>({});

  // Mapping from task uid to hash.
  private trackingTasks = new Map<string, string | undefined>();
  private branchBaselines = new Map<string, BranchBaseline>();
  private branchBaselinePending = false;
  private branchBaselineRevision = 0;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly workspaceScope: WorkspaceScope,
    private readonly checkpointService: CheckpointService,
    private readonly taskActivityTracker: TaskActivityTracker,
    private readonly gitState: GitState,
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {
    this.branchBaselines = this.loadBranchBaselines();
    this.setupEventListeners();
  }

  private get cwd() {
    return this.workspaceScope.cwd;
  }

  private get branchBaselinesStateKey() {
    return `${branchBaselinesStateKeyPrefix}:${this.cwd ?? ""}`;
  }

  private loadBranchBaselines() {
    const stored = this.context.workspaceState.get(
      this.branchBaselinesStateKey,
    );
    const branchBaselines = new Map<string, BranchBaseline>();
    if (
      typeof stored !== "object" ||
      stored === null ||
      Array.isArray(stored)
    ) {
      return branchBaselines;
    }

    for (const [uid, value] of Object.entries(stored)) {
      if (
        typeof value !== "object" ||
        value === null ||
        !("baseline" in value) ||
        typeof value.baseline !== "string"
      ) {
        continue;
      }

      const taskCheckpoint =
        "taskCheckpoint" in value ? value.taskCheckpoint : undefined;
      if (taskCheckpoint !== undefined && typeof taskCheckpoint !== "string") {
        continue;
      }

      branchBaselines.set(uid, {
        baseline: value.baseline,
        taskCheckpoint,
      });
    }

    return branchBaselines;
  }

  private persistBranchBaselines = runExclusive.build(async () => {
    try {
      await this.context.workspaceState.update(
        this.branchBaselinesStateKey,
        Object.fromEntries(this.branchBaselines),
      );
    } catch (error) {
      logger.error("Failed to persist user-edit branch baselines", error);
    }
  });

  private setupEventListeners() {
    if (!this.cwd) {
      return;
    }
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.cwd, "**/*"),
    );
    this.disposables.push(watcher);

    const shouldIgnore = (uri: vscode.Uri) => uri.path.includes("/.git/");

    this.disposables.push(
      watcher.onDidCreate((e) => {
        if (shouldIgnore(e)) return;
        logger.trace(`File created, triggering update, ${e.fsPath}`);
        this.triggerUpdate.call();
      }),
    );
    this.disposables.push(
      watcher.onDidDelete((e) => {
        if (shouldIgnore(e)) return;
        logger.trace(`File deleted, triggering update, ${e.fsPath}`);
        this.triggerUpdate.call();
      }),
    );
    this.disposables.push(
      watcher.onDidChange((e) => {
        if (shouldIgnore(e)) return;
        logger.trace(`File changed, triggering update, ${e.fsPath}`);
        this.triggerUpdate.call();
      }),
    );

    // Watch active pochi tasks to maintain tracking tasks state.
    this.disposables.push({
      dispose: this.taskActivityTracker.state.subscribe((tasks) => {
        logger.trace("Received tasks update", {
          tasksCount: Object.keys(tasks).length,
          currentCwd: this.cwd,
        });

        const newEdits = { ...this.edits.value };
        let didChangeBranchBaselines = false;
        for (const uid of this.trackingTasks.keys()) {
          if (!tasks[uid] || tasks[uid].cwd !== this.cwd) {
            this.trackingTasks.delete(uid);
            delete newEdits[uid];
          }
        }
        // Drop persisted baselines for tasks that are no longer active in this
        // workspace. Iterate branchBaselines (not only trackingTasks) so entries
        // restored from workspaceState without a live tracking entry are pruned.
        for (const uid of [...this.branchBaselines.keys()]) {
          if (!tasks[uid] || tasks[uid].cwd !== this.cwd) {
            this.branchBaselines.delete(uid);
            didChangeBranchBaselines = true;
          }
        }

        const isDeleted =
          Object.keys(newEdits).length < Object.keys(this.edits.value).length;

        let isDirty = false;
        for (const [uid, task] of Object.entries(tasks)) {
          const { cwd, lastCheckpointHash: hash } = task;
          if (cwd === this.cwd) {
            logger.trace(
              `Updating edits for task ${uid} with hash ${hash}, original: ${this.trackingTasks.get(uid)}`,
            );
            if (this.trackingTasks.get(uid) !== hash) {
              logger.trace(`Adding/updating tracking task ${uid}`, { hash });
              this.trackingTasks.set(uid, hash);
              const branchBaseline = this.branchBaselines.get(uid);
              if (branchBaseline && branchBaseline.taskCheckpoint !== hash) {
                this.branchBaselines.delete(uid);
                didChangeBranchBaselines = true;
              }
              isDirty = true;
            }
          }
        }

        if (didChangeBranchBaselines) {
          void this.persistBranchBaselines();
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

    this.disposables.push(
      this.gitState.onDidChangeBranch(({ repository }) => {
        const cwd = this.cwd;
        if (!cwd) return;

        const relativePath = path.relative(repository, cwd);
        if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
          return;
        }

        this.resetBaselineAfterBranchChange();
      }),
    );
  }

  private resetBaselineAfterBranchChange = runExclusive.build(async () => {
    this.branchBaselinePending = true;
    this.branchBaselineRevision++;
    const trackingTasks = new Map<string, string | undefined>(
      this.trackingTasks,
    );
    this.edits.value = Object.fromEntries(
      Array.from(trackingTasks.keys(), (uid) => [uid, []]),
    );
    // All baselines for this workspace are invalid after a branch switch,
    // including persisted entries for tasks that are not currently tracked.
    this.branchBaselines.clear();

    try {
      const baseline = await this.checkpointService.saveUserEditBaseline();
      for (const [uid, taskCheckpoint] of trackingTasks) {
        if (this.trackingTasks.get(uid) === taskCheckpoint) {
          this.branchBaselines.set(uid, { taskCheckpoint, baseline });
        }
      }
    } catch (error) {
      logger.error("Failed to reset user edits after branch change", error);
    } finally {
      await this.persistBranchBaselines();
      this.branchBaselinePending = false;
      this.triggerUpdate.call();
    }
  });

  private triggerUpdate = funnel(() => this.updateEdits(), {
    minGapMs: 1000,
    triggerAt: "both",
  });

  private updateEdits = runExclusive.build(async () => {
    if (this.trackingTasks.size === 0 || this.branchBaselinePending) {
      return;
    }

    const branchBaselineRevision = this.branchBaselineRevision;
    const nextEdits = { ...this.edits.value };

    for (const [uid, hash] of this.trackingTasks.entries()) {
      try {
        const latestCheckpoint = this.checkpointService.latestCheckpoint.value;
        const storedBranchBaseline = this.branchBaselines.get(uid);
        const branchBaseline =
          storedBranchBaseline?.taskCheckpoint === hash
            ? storedBranchBaseline
            : undefined;
        const effectiveHash = branchBaseline?.baseline ?? hash;
        logger.trace(
          `Updating edits for task ${uid} with hash ${effectiveHash}, latest ${latestCheckpoint}`,
        );
        // If the checkpoint hash is not the latest, or if there's no checkpoint yet,
        // we cannot guarantee the diffs are accurate, so we clear them.
        if (
          !effectiveHash ||
          (!branchBaseline && effectiveHash !== latestCheckpoint)
        ) {
          nextEdits[uid] = [];
        } else {
          const diffs = await this.checkpointService.getCheckpointFileEdits(
            effectiveHash,
            undefined,
            {
              maxSizeLimit: 20 * 1024,
              inlineDiff: true,
            },
          );

          if (this.trackingTasks.has(uid)) {
            logger.trace("set diffs for task", uid, effectiveHash);
            nextEdits[uid] = diffs ?? [];
          }
        }
      } catch (error) {
        logger.error(`Failed to update user edits for hash ${hash}`, error);
      }
    }

    if (branchBaselineRevision !== this.branchBaselineRevision) {
      return;
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
