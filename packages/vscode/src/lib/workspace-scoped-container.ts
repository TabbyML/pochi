import { type DependencyContainer, container } from "tsyringe";
import type * as vscode from "vscode";

const activeContainers = new Map<string | null, DependencyContainer>();

export class WorkspaceScope implements vscode.Disposable {
  // cwd === null means no workspace is currently open.
  constructor(readonly cwd: string | null) {}

  dispose() {
    activeContainers.delete(this.cwd);
  }
}

export function getWorkspaceScopedContainer(
  cwd: string | null,
): DependencyContainer {
  let childContainer = activeContainers.get(cwd);
  if (childContainer) {
    return childContainer;
  }

  childContainer = container.createChildContainer();
  childContainer.register<WorkspaceScope>("WorkspaceScope", {
    useValue: new WorkspaceScope(cwd),
  });
  activeContainers.set(cwd, childContainer);
  return childContainer;
}
