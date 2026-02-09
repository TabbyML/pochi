import { container } from "tsyringe";
import type * as vscode from "vscode";
import { LayoutManager } from "./layout-manager";

export function getViewColumnForTask() {
  return container.resolve(LayoutManager).getViewColumnForTask();
}

export function getViewColumnForTerminal() {
  return container.resolve(LayoutManager).getViewColumnForTerminal();
}

export function createTerminal(
  options: vscode.TerminalOptions | vscode.ExtensionTerminalOptions,
) {
  return container.resolve(LayoutManager).createTerminal(options);
}

export { LayoutManager };
export { findActivePochiTaskTab } from "./tab-utils";
