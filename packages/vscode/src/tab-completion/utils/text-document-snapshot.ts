import * as vscode from "vscode";
import { type TextEdit, applyEdit } from "./text-edit";

enum CharCode {
  LineFeed = 10,
  CarriageReturn = 13,
}

function isEOL(char: number) {
  return char === CharCode.CarriageReturn || char === CharCode.LineFeed;
}

function computeLineOffsets(
  text: string,
  isAtLineStart: boolean,
  textOffset = 0,
): number[] {
  const result: number[] = isAtLineStart ? [textOffset] : [];
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (isEOL(ch)) {
      if (
        ch === CharCode.CarriageReturn &&
        i + 1 < text.length &&
        text.charCodeAt(i + 1) === CharCode.LineFeed
      ) {
        i++;
      }
      result.push(textOffset + i + 1);
    }
  }
  return result;
}

export class TextDocumentSnapshot implements vscode.TextDocument {
  private lineOffsets: number[];

  public constructor(
    readonly uri: vscode.Uri,
    readonly languageId: string,
    readonly version: number,
    readonly content: string,
  ) {
    this.lineOffsets = computeLineOffsets(this.content, true);
  }

  public get fileName(): string {
    return this.uri.fsPath;
  }

  public get isUntitled(): boolean {
    return this.uri.scheme === "untitled";
  }

  public get encoding() {
    return "utf-8";
  }

  public get isDirty() {
    return false;
  }

  public get isClosed() {
    return false;
  }

  async save(): Promise<boolean> {
    throw new Error("Method should not be called.");
  }

  public get eol(): vscode.EndOfLine {
    return vscode.EndOfLine.LF;
  }

  public get lineCount() {
    return this.lineOffsets.length;
  }

  lineAt(position: unknown): vscode.TextLine {
    let lineNumber: number;

    if (typeof position === "number") {
      lineNumber = position;
    } else if (position && typeof position === "object" && "line" in position) {
      lineNumber = (position as vscode.Position).line;
    } else {
      throw new Error("Invalid position");
    }

    if (lineNumber < 0 || lineNumber >= this.lineCount) {
      throw new Error("Line number out of range");
    }

    const lineStart = this.lineOffsets[lineNumber];
    const lineEnd =
      lineNumber + 1 < this.lineOffsets.length
        ? this.lineOffsets[lineNumber + 1] - 1
        : this.content.length;

    // Remove trailing line ending characters
    let actualLineEnd = lineEnd;
    while (
      actualLineEnd > lineStart &&
      isEOL(this.content.charCodeAt(actualLineEnd - 1))
    ) {
      actualLineEnd--;
    }

    const lineText = this.content.substring(lineStart, actualLineEnd);
    const range = new vscode.Range(lineNumber, 0, lineNumber, lineText.length);
    const rangeIncludingLineBreak = new vscode.Range(
      lineNumber,
      0,
      lineNumber,
      lineEnd - lineStart,
    );

    return {
      lineNumber,
      text: lineText,
      range,
      rangeIncludingLineBreak,
      firstNonWhitespaceCharacterIndex:
        this.getFirstNonWhitespaceIndex(lineText),
      isEmptyOrWhitespace: lineText.trim().length === 0,
    };
  }

  getWordRangeAtPosition(
    position: vscode.Position,
    regex?: RegExp,
  ): vscode.Range | undefined {
    const validatedPosition = this.validatePosition(position);
    const line = this.lineAt(validatedPosition.line);

    const wordRegex =
      regex ||
      /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g;

    let match: RegExpExecArray | null = wordRegex.exec(line.text);
    while (match !== null) {
      const startChar = match.index;
      const endChar = match.index + match[0].length;

      if (
        startChar <= validatedPosition.character &&
        validatedPosition.character <= endChar
      ) {
        return new vscode.Range(
          validatedPosition.line,
          startChar,
          validatedPosition.line,
          endChar,
        );
      }
      match = wordRegex.exec(line.text);
    }

    return undefined;
  }

  validateRange(range: vscode.Range): vscode.Range {
    const start = this.validatePosition(range.start);
    const end = this.validatePosition(range.end);

    if (start.isEqual(range.start) && end.isEqual(range.end)) {
      return range;
    }

    return new vscode.Range(start, end);
  }

  validatePosition(position: vscode.Position): vscode.Position {
    const line = Math.max(0, Math.min(position.line, this.lineCount - 1));
    let character = Math.max(0, position.character);

    if (line < this.lineCount) {
      const lineText = this.lineAt(line).text;
      character = Math.min(character, lineText.length);
    }

    if (line === position.line && character === position.character) {
      return position;
    }

    return new vscode.Position(line, character);
  }

  // Helper method for lineAt
  private getFirstNonWhitespaceIndex(text: string): number {
    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      if (char !== " " && char !== "\t") {
        return i;
      }
    }
    return text.length;
  }

  public getText(range?: vscode.Range): string {
    if (range) {
      const start = this.offsetAt(range.start);
      const end = this.offsetAt(range.end);
      return this.content.substring(start, end);
    }
    return this.content;
  }

  public positionAt(offset: number): vscode.Position {
    let resultOffset = offset;
    resultOffset = Math.max(Math.min(offset, this.content.length), 0);

    const lineOffsets = this.lineOffsets;
    let low = 0;
    let high = lineOffsets.length;
    if (high === 0) {
      return new vscode.Position(0, resultOffset);
    }
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (lineOffsets[mid] > resultOffset) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    // low is the least x for which the line offset is larger than the current offset
    // or array.length if no line offset is larger than the current offset
    const line = low - 1;

    resultOffset = this.ensureBeforeEOL(resultOffset, lineOffsets[line]);
    return new vscode.Position(
      line,
      Math.max(resultOffset - lineOffsets[line], 0),
    );
  }

  public offsetAt(position: vscode.Position) {
    const lineOffsets = this.lineOffsets;
    if (position.line >= lineOffsets.length) {
      return this.content.length;
    }
    if (position.line < 0) {
      return 0;
    }
    const lineOffset = lineOffsets[position.line];
    if (position.character <= 0) {
      return lineOffset;
    }

    const nextLineOffset =
      position.line + 1 < lineOffsets.length
        ? lineOffsets[position.line + 1]
        : this.content.length;
    const offset = Math.min(lineOffset + position.character, nextLineOffset);
    return this.ensureBeforeEOL(offset, lineOffset);
  }

  private ensureBeforeEOL(offset: number, lineOffset: number): number {
    let resultOffset = offset;
    while (
      resultOffset > lineOffset &&
      isEOL(this.content.charCodeAt(resultOffset - 1))
    ) {
      resultOffset--;
    }
    return resultOffset;
  }
}

export function getLines(textDocument: vscode.TextDocument): string[] {
  const lines: string[] = [];
  for (let i = 0; i < textDocument.lineCount; i++) {
    lines.push(textDocument.lineAt(i).text);
  }
  return lines;
}

export function createTextDocumentSnapshot(document: vscode.TextDocument) {
  return new TextDocumentSnapshot(
    document.uri,
    document.languageId,
    document.version,
    document.getText(),
  );
}

export function createTextDocumentSnapshotWithNewText(
  document: vscode.TextDocument,
  newText: string,
) {
  return new TextDocumentSnapshot(
    document.uri,
    document.languageId,
    0,
    newText,
  );
}

export function createTextDocumentSnapshotWithEmptyText(
  document: vscode.TextDocument,
) {
  return createTextDocumentSnapshotWithNewText(document, "");
}

export function createTextDocumentSnapshotWithApplyEdit(
  document: vscode.TextDocument,
  edit: TextEdit,
) {
  const originalText = document.getText();
  const newText = applyEdit(originalText, edit).text;
  return createTextDocumentSnapshotWithNewText(document, newText);
}
