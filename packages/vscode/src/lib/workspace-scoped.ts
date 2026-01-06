import { getLogger } from "@getpochi/common";
import { type DependencyContainer, container } from "tsyringe";
import * as vscode from "vscode";

const logger = getLogger("WorkspaceScoped");
const activeContainers = new Map<string | null, DependencyContainer>();

export class WorkspaceScope {
  // cwd === null means no workspace is currently open.
  constructor(
    readonly cwd: string | null,
    readonly workspaceUri: vscode.Uri | null,
  ) {}

  get workspacePath() {
    return this.workspaceUri?.fsPath;
  }

  get isMainWorkspace() {
    return this.cwd === this.workspacePath && this.cwd !== null;
  }
}

export function workspaceScoped(cwd: string): DependencyContainer {
  let childContainer = activeContainers.get(cwd);
  if (childContainer) {
    return childContainer;
  }
  logger.debug(
    `Creating workspace-scoped container for cwd: ${cwd ?? "(no workspace)"}`,
  );
  childContainer = container.createChildContainer();
  childContainer.register(WorkspaceScope, {
    useValue: new WorkspaceScope(
      cwd,
      vscode.workspace.workspaceFolders?.[0].uri ?? null,
    ),
  });
  activeContainers.set(cwd, childContainer);
  return childContainer;
}
