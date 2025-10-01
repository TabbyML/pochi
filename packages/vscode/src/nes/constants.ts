import type * as vscode from "vscode";

export const DocumentSelector: vscode.DocumentSelector = [
  { scheme: "file" },
  { scheme: "vscode-vfs" },
  { scheme: "untitled" },
  { scheme: "vscode-notebook-cell" },
  { scheme: "vscode-userdata" },
];

export const EditableRegionPrefixLine = 5;
export const EditableRegionSuffixLine = 5;
export const DocumentPrefixLine = 15;
export const DocumentSuffixLine = 15;
