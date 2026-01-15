import * as vscode from "vscode";
import type { LinesDiff } from "vscode-diff";
import type { LineNumberRange } from "./range";

export interface RangeMapping {
  original: vscode.Range;
  modified: vscode.Range;
}

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

// from 1-based line-number range to LineNumberRange
export function toZeroBasedLineNumberRange(range: {
  startLineNumber: number;
  endLineNumberExclusive: number;
}): LineNumberRange {
  return {
    start: range.startLineNumber - 1,
    end: range.endLineNumberExclusive - 1,
  };
}

// from 1-based line-number&column range to vscode.Range
export function toZeroBasedPositionRange(range: {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}): vscode.Range {
  return new vscode.Range(
    range.startLineNumber - 1,
    range.startColumn - 1,
    range.endLineNumber - 1,
    range.endColumn - 1,
  );
}

export function toCodeDiff(diffResult: LinesDiff): CodeDiff {
  return {
    changes: diffResult.changes.map((change) => {
      return {
        original: toZeroBasedLineNumberRange(change.original),
        modified: toZeroBasedLineNumberRange(change.modified),
        innerChanges:
          change.innerChanges?.map((c) => {
            return {
              original: toZeroBasedPositionRange(c.originalRange),
              modified: toZeroBasedPositionRange(c.modifiedRange),
            };
          }) ?? [],
      };
    }),
  };
}
