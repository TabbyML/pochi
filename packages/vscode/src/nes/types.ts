import type * as vscode from "vscode";

export interface Range<T> {
  start: T;
  end: T; // exclusive
}

// 0-based char offset
export type OffsetRange = Range<number>;

export interface TextChange {
  range: OffsetRange;
  text: string;
}

// A TextEdit represents a single edit action.
// A TextEdit may contain multiple ranges modified. The ranges must not overlap.
export interface TextEdit {
  changes: TextChange[];
}

export interface RangeMapping {
  original: vscode.Range;
  modified: vscode.Range;
}

// 0-based line number
export type LineNumberRange = Range<number>;

export interface LineRangeMapping {
  original: LineNumberRange;
  modified: LineNumberRange;
}

export interface DetailedLineRangeMapping extends LineRangeMapping {
  innerChanges: RangeMapping[];
}

export interface CodeDiff {
  changes: DetailedLineRangeMapping[];
}

// FIXME(zhiming): refactor: use NESSolutionItemSource
export interface NESResponseItem {
  textEdit: TextEdit;
}
