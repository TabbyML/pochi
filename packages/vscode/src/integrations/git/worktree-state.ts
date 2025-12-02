import { toErrorMessage } from "@getpochi/common";
import { WorktreeData } from "@getpochi/common/vscode-webui-bridge";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

@injectable()
@singleton()
export class WorktreeDataStore {
  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {}

  get(worktreePath: string): WorktreeData | undefined {
    const raw = this.context.workspaceState.get<WorktreeData>(worktreePath);
    return raw;
  }

  set(worktreePath: string, data: WorktreeData) {
    try {
      const parsed = WorktreeData.parse(data);
      this.context.workspaceState.update(worktreePath, parsed);
      return parsed;
    } catch (error) {
      throw new Error(
        `Failed to set worktree data for path: ${worktreePath}. Error: ${toErrorMessage(error)}`,
      );
    }
  }

  initialize(worktreePath: string) {
    const existing = this.get(worktreePath);
    if (!existing) {
      return this.set(worktreePath, {
        nextIncrementalId: 1,
        github: {},
      });
    }
    return existing;
  }

  getIncrementalId(worktreePath: string): number {
    let data = this.get(worktreePath);
    if (!data) {
      data = this.initialize(worktreePath);
    }
    const id = data.nextIncrementalId;
    data.nextIncrementalId += 1;
    this.set(worktreePath, data);
    return id;
  }

  delete(worktreePath: string) {
    this.context.workspaceState.update(worktreePath, undefined);
  }
}
