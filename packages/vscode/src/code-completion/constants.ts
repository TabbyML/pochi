import type * as vscode from "vscode";

export const DocumentSelector: vscode.DocumentSelector = [
  { scheme: "file" },
  { scheme: "vscode-vfs" },
  { scheme: "untitled" },
  { scheme: "vscode-notebook-cell" },
  { scheme: "vscode-userdata" },
];
