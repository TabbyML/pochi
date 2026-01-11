import * as vscode from "vscode";

export function getRelativePath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri);
}
