import type * as vscode from "vscode";

export interface NESResponseItem {
  text: string;
}

export interface TextContentChange {
  range: vscode.Range;
  rangeOffset: number;
  rangeLength: number;
  text: string;
}
