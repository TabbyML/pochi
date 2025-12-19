import type { WorkspaceScope } from "@/lib/workspace-scoped";
import { getLogger } from "@getpochi/common";
import type { FileDiff } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { funnel } from "remeda";
import * as runExclusive from "run-exclusive";
import { Lifecycle, injectable, scoped } from "tsyringe";
import * as vscode from "vscode";
import type { PochiTaskState } from "../editor/pochi-task-state";
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
    this.disposables.push(watcher.onDidCreate(() => this.triggerUpdate.call()));
    this.disposables.push(watcher.onDidDelete(() => this.triggerUpdate.call()));
    this.disposables.push(watcher.onDidChange(() => this.triggerUpdate.call()));

    // Watch active pochi tasks to maintain tracking tasks state.
    this.disposables.push({
      dispose: this.pochiTaskState.state.subscribe((tasks) => {
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
          if (active && cwd === this.cwd && hash) {
            if (this.trackingTasks.get(uid) !== hash) {
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
  }

  private triggerUpdate = funnel(() => this.updateEdits(), {
    minGapMs: 1000,
    triggerAt: "both",
  });

  private updateEdits = runExclusive.build(async () => {
    if (this.trackingTasks.size === 0) {
      return;
    }

    const promises = this.trackingTasks.entries().map(async ([uid, hash]) => {
      try {
        const diffs = await this.checkpointService.getCheckpointFileEdits(hash);
        return { uid, diffs };
      } catch (error) {
        logger.error(`Failed to update user edits for hash ${hash}`, error);
        return null;
      }
    });

    const results = await Promise.all(promises);
    const nextEdits = { ...this.edits.value };

    for (const result of results) {
      if (result?.diffs && this.trackingTasks.has(result.uid)) {
        nextEdits[result.uid] = result.diffs;
      }
    }

    // Clean up any hashes that are no longer tracked
    for (const key of Object.keys(nextEdits)) {
      if (!this.trackingTasks.has(key)) {
        delete nextEdits[key];
      }
    }

    this.edits.value = nextEdits;
  });

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
