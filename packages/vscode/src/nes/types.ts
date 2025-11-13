import type * as vscode from "vscode";

export interface NESResponseItem {
  text: string;
}

export interface CharRange {
  offset: number;
  length: number;
}

// FIXME(zhiming): refactor to only use CharacterRange
export interface TextContentChange {
  range: vscode.Range;
  rangeOffset: number;
  rangeLength: number;
  text: string;
}
