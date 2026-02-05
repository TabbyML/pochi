import * as vscode from "vscode";
import type { LinesDiff } from "vscode-diff";
import { type LineNumberRange, isLineEndPosition } from "./range";
import { isBlank } from "./string";

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

export const LinesDiffOptions = {
  ignoreTrimWhitespace: false,
  maxComputationTimeMs: 0,
  computeMoves: false,
  extendToSubwords: true,
};

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

export function isAddingBlankLines(
  change: RangeMapping,
  originalDocument: vscode.TextDocument,
  modifiedDocument: vscode.TextDocument,
): boolean {
  const { original, modified } = change;
  if (
    original.start.isEqual(original.end) &&
    (original.start.character === 0 ||
      isLineEndPosition(original.start, originalDocument))
  ) {
    const modifiedText = modifiedDocument.getText(modified);
    if (modifiedText.includes("\n") && isBlank(modifiedText)) {
      return true;
    }
  }
  return false;
}

export function isRemovingBlankLines(
  change: RangeMapping,
  originalDocument: vscode.TextDocument,
  modifiedDocument: vscode.TextDocument,
): boolean {
  return isAddingBlankLines(
    {
      original: change.modified,
      modified: change.original,
    },
    modifiedDocument,
    originalDocument,
  );
}
