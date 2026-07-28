import * as assert from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import type { WorkspaceScope } from "@/lib/workspace-scoped";
import type { TaskStates } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { afterEach, describe, it } from "mocha";
import * as sinon from "sinon";
import * as vscode from "vscode";
import type { TaskActivityTracker } from "../../editor/task-activity-tracker";
import type { GitBranchChangeEvent, GitState } from "../../git/git-state";
import type { CheckpointService } from "../checkpoint-service";
import { UserEditState } from "../user-edit-state";

interface UserEditStateInternals {
  handleBranchChange(): void;
}

describe("UserEditState", () => {
  let userEditState: UserEditState | undefined;
  let workspaceUri: vscode.Uri | undefined;

  afterEach(async () => {
    userEditState?.dispose();
    if (workspaceUri) {
      await vscode.workspace.fs.delete(workspaceUri, {
        recursive: true,
        useTrash: false,
      });
    }
    sinon.restore();
  });

  it("clears edits immediately for consecutive branch changes", async () => {
    workspaceUri = vscode.Uri.file(
      path.join(os.tmpdir(), `pochi-user-edit-state-${Date.now()}`),
    );
    await vscode.workspace.fs.createDirectory(workspaceUri);
    const cwd = workspaceUri.fsPath;

    const baselineResolvers: Array<(baseline: string) => void> = [];
    const saveUserEditBaseline = sinon.stub().callsFake(
      () =>
        new Promise<string>((resolve) => {
          baselineResolvers.push(resolve);
        }),
    );
    const taskState = signal<TaskStates>({
      taskId: {
        cwd,
        lastCheckpointHash: "checkpoint",
      },
    });
    const branchChangeEmitter = new vscode.EventEmitter<GitBranchChangeEvent>();
    const workspaceState = new Map<string, unknown>();

    userEditState = new UserEditState(
      { cwd } as WorkspaceScope,
      {
        latestCheckpoint: signal<string | null>("checkpoint"),
        saveUserEditBaseline,
      } as unknown as CheckpointService,
      { state: taskState } as TaskActivityTracker,
      {
        onDidChangeBranch: branchChangeEmitter.event,
      } as GitState,
      {
        workspaceState: {
          get: (key: string) => workspaceState.get(key),
          update: async (key: string, value: unknown) => {
            workspaceState.set(key, value);
          },
        },
      } as unknown as vscode.ExtensionContext,
    );

    const internals = userEditState as unknown as UserEditStateInternals;
    userEditState.edits.value = {
      taskId: [{ filepath: "first.ts", added: 1, removed: 0, diff: "" }],
    };
    internals.handleBranchChange();
    assert.deepStrictEqual(userEditState.edits.value, { taskId: [] });

    userEditState.edits.value = {
      taskId: [{ filepath: "stale.ts", added: 1, removed: 0, diff: "" }],
    };
    internals.handleBranchChange();

    assert.deepStrictEqual(userEditState.edits.value, { taskId: [] });
    assert.strictEqual(saveUserEditBaseline.callCount, 1);

    baselineResolvers[0]("first-baseline");
    await waitFor(() => saveUserEditBaseline.callCount === 2);
    baselineResolvers[1]("second-baseline");
    await waitFor(() => workspaceState.size > 0);

    assert.deepStrictEqual(userEditState.edits.value, { taskId: [] });
  });
});

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail("Timed out waiting for condition");
}
