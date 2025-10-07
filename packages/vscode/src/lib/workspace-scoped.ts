import { getLogger } from "@getpochi/common";
import { type DependencyContainer, container } from "tsyringe";
import * as vscode from "vscode";

const logger = getLogger("WorkspaceScoped");
const activeContainers = new Map<string | null, DependencyContainer>();

export class WorkspaceScope {
  // cwd === null means no workspace is currently open.
  constructor(readonly cwd: string | null) {}
}

export function workspaceScoped(inputCwd?: string): DependencyContainer {
  const cwd =
    inputCwd || vscode.workspace.workspaceFolders?.[0].uri.fsPath || null;
  let childContainer = activeContainers.get(cwd);
  if (childContainer) {
    return childContainer;
  }
  logger.debug(
    `Creating workspace-scoped container for cwd: ${cwd ?? "(no workspace)"}`,
  );
  childContainer = container.createChildContainer();
  childContainer.register<WorkspaceScope>("WorkspaceScope", {
    useValue: new WorkspaceScope(cwd),
  });
  activeContainers.set(cwd, childContainer);
  return childContainer;
}
