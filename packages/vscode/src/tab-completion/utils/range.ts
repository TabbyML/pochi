import * as vscode from "vscode";

// 0-based char offset
export type OffsetRange = {
  start: number;
  end: number;
};

// 0-based line number
export type LineNumberRange = {
  start: number;
  end: number;
};

export function mergeRanges<T extends OffsetRange | LineNumberRange>(
  ranges: T[],
): T | undefined {
  if (ranges.length === 0) {
    return undefined;
  }
  return ranges.reduce<T>((acc, curr) => {
    return {
      start: Math.min(acc.start, curr.start),
      end: Math.max(acc.end, curr.end),
    } as T;
  }, ranges[0]);
}

export function toOffsetRange(
  range: vscode.Range,
  document: vscode.TextDocument,
): OffsetRange {
  return {
    start: document.offsetAt(range.start),
    end: document.offsetAt(range.end),
  };
}

export function offsetRangeToPositionRange(
  range: OffsetRange,
  document: vscode.TextDocument,
): vscode.Range {
  return new vscode.Range(
    document.positionAt(range.start),
    document.positionAt(range.end),
  );
}

export function isRangeConnected(a: OffsetRange, b: OffsetRange) {
  return (
    a.start === b.start ||
    a.start === b.end ||
    a.end === b.start ||
    a.end === b.end
  );
}

export function lineNumberRangeToPositionRange(
  range: LineNumberRange,
  document: vscode.TextDocument,
): vscode.Range {
  if (range.end === range.start) {
    return document.validateRange(
      new vscode.Range(range.start, 0, range.start, 0),
    );
  }
  return document.validateRange(
    new vscode.Range(
      range.start,
      0,
      range.end - 1,
      document.lineAt(range.end - 1).text.length,
    ),
  );
}

export function isLineEndPosition(
  position: vscode.Position,
  document: vscode.TextDocument,
): boolean {
  const textLine = document.lineAt(position);
  return position.character === textLine.text.length;
}
