import { StaticTextDocument } from "@/code-completion/utils/static-text-document";
import * as vscode from "vscode";
import type { CodeDiff, LineNumberRange, OffsetRange, TextEdit } from "./types";
import type { LinesDiff } from "vscode-diff";

// Position & Range

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

export function toOffsetRange(
  range: vscode.Range,
  document: vscode.TextDocument,
): OffsetRange {
  return {
    start: document.offsetAt(range.start),
    end: document.offsetAt(range.end),
  };
}

export function toPositionRange(
  range: OffsetRange,
  document: vscode.TextDocument,
): vscode.Range {
  return new vscode.Range(
    document.positionAt(range.start),
    document.positionAt(range.end),
  );
}

export function isLineStartPosition(
  position: vscode.Position,
  _document: vscode.TextDocument,
): boolean {
  return position.character === 0;
}

export function isLineEndPosition(
  position: vscode.Position,
  document: vscode.TextDocument,
): boolean {
  const textLine = document.lineAt(position);
  return position.character === textLine.text.length;
}

export function isRangeContacted(a: OffsetRange, b: OffsetRange) {
  return (
    a.start === b.start ||
    a.start === b.end ||
    a.end === b.start ||
    a.end === b.end
  );
}

// Diff

export function toCodeDiff(diffResult: LinesDiff): CodeDiff {
  return {
    changes: diffResult.changes.map((change) => {
      return {
        original: toZeroBasedLineNumberRange(change.original),
        modified: toZeroBasedLineNumberRange(change.modified),
        innerChanges: change.innerChanges?.map((c) => {
          return {
            original: toZeroBasedPositionRange(c.originalRange),
            modified: toZeroBasedPositionRange(c.modifiedRange),
          };
        }) ?? [
          {
            original: new vscode.Range(
              change.original.startLineNumber,
              0,
              change.original.endLineNumberExclusive - 1,
              0,
            ),
            modified: new vscode.Range(
              change.modified.startLineNumber,
              0,
              change.modified.endLineNumberExclusive - 1,
              0,
            ),
          },
        ],
      };
    }),
  };
}

// TextDocument

export function getLines(textDocument: vscode.TextDocument): string[] {
  const lines: string[] = [];
  for (let i = 0; i < textDocument.lineCount; i++) {
    lines.push(textDocument.lineAt(i).text);
  }
  return lines;
}

export function createTextDocumentSnapshot(document: vscode.TextDocument) {
  return new StaticTextDocument(
    document.uri,
    document.languageId,
    document.version,
    document.getText(),
  );
}

export function createTextDocumentWithNewText(
  document: vscode.TextDocument,
  newText: string,
) {
  return new StaticTextDocument(document.uri, document.languageId, 0, newText);
}

export function createTextDocumentWithEmptyText(document: vscode.TextDocument) {
  return createTextDocumentWithNewText(document, "");
}

export function createTextDocumentWithApplyEdit(
  document: vscode.TextDocument,
  edit: TextEdit,
) {
  const originalText = document.getText();
  const newText = applyEdit(originalText, edit).text;
  return createTextDocumentWithNewText(document, newText);
}

// String

export function applyEdit(
  original: string,
  edit: TextEdit,
): {
  text: string;
  editedRanges: OffsetRange[];
} {
  const sortedChanges = edit.changes.toSorted((a, b) => {
    return a.range.start - b.range.start;
  });
  let text = "";
  let originalIndex = 0;
  let editedIndex = 0;
  const editedRanges: OffsetRange[] = [];
  for (const change of sortedChanges) {
    const skippedText = original.slice(originalIndex, change.range.start);
    text += skippedText + change.text;
    const editedRangeStart = editedIndex + skippedText.length;
    const editedRangeEnd = editedRangeStart + change.text.length;
    editedRanges.push({
      start: editedRangeStart,
      end: editedRangeEnd,
    });
    originalIndex = change.range.end;
    editedIndex = editedRangeEnd;
  }
  text += original.slice(originalIndex);
  return { text, editedRanges };
}

export function isSubsequence(small: string, large: string): boolean {
  let i = 0;
  let j = 0;
  while (i < small.length && j < large.length) {
    if (small[i] === large[j]) {
      i++;
    }
    j++;
  }
  return i === small.length;
}
