import { getLogger } from "@/lib/logger";
import * as vscode from "vscode";
import { linesDiffComputers } from "vscode-diff";
import type { TabCompletionContext } from "../context";
import type { TabCompletionProviderResponseItem } from "../providers/types";
import {
  type CodeDiff,
  type RangeMapping,
  type TextChange,
  type TextEdit,
  createTextDocumentSnapshotWithApplyEdit,
  createTextDocumentSnapshotWithEmptyText,
  getLines,
  isBlank,
  isLineEndPosition,
  lineNumberRangeToPositionRange,
  toCodeDiff,
  toOffsetRange,
} from "../utils";

const logger = getLogger("TabCompletion.Solution.Item");

const linesDiffOptions = {
  ignoreTrimWhitespace: false,
  maxComputationTimeMs: 0,
  computeMoves: false,
  extendToSubwords: true,
};

export class TabCompletionSolutionItem {
  public readonly valid: boolean;
  public readonly target: vscode.TextDocument;
  public readonly diff: CodeDiff;
  public readonly textEdit: TextEdit;
  public readonly inlineCompletionItem: vscode.InlineCompletionItem | undefined;

  constructor(
    public readonly context: TabCompletionContext,
    public readonly responseItem: TabCompletionProviderResponseItem,
  ) {
    const originalDocument = context.documentSnapshot;
    const editedDocument = createTextDocumentSnapshotWithApplyEdit(
      originalDocument,
      responseItem.edit,
    );
    const diffResult = linesDiffComputers
      .getDefault()
      .computeDiff(
        getLines(originalDocument),
        getLines(editedDocument),
        linesDiffOptions,
      );
    const diff = toCodeDiff(diffResult);

    // refine changes
    const refinedChanges: TextChange[] = [];
    for (const change of diff.changes) {
      for (const innerChange of change.innerChanges) {
        if (shouldSkipChange(innerChange, originalDocument, editedDocument)) {
          continue;
        }
        refinedChanges.push({
          range: toOffsetRange(innerChange.original, originalDocument),
          text: editedDocument.getText(innerChange.modified),
        });
      }
    }
    if (refinedChanges.length < 1) {
      this.valid = false;
      this.target = createTextDocumentSnapshotWithEmptyText(originalDocument);
      this.diff = { changes: [] };
      this.textEdit = { changes: [] };
      return;
    }

    const refinedTextEdit: TextEdit = { changes: refinedChanges };
    const targetDocument = createTextDocumentSnapshotWithApplyEdit(
      originalDocument,
      refinedTextEdit,
    );
    const refinedDiffResult = linesDiffComputers
      .getDefault()
      .computeDiff(
        getLines(originalDocument),
        getLines(targetDocument),
        linesDiffOptions,
      );
    const refinedDiff = toCodeDiff(refinedDiffResult);
    const inlineCompletionItem = this.calculateInlineCompletionItem(
      refinedDiff,
      originalDocument,
      targetDocument,
      context.selection.active,
    );

    this.valid = true;
    this.target = targetDocument;
    this.diff = refinedDiff;
    this.textEdit = refinedTextEdit;
    this.inlineCompletionItem = inlineCompletionItem;
  }

  private calculateInlineCompletionItem(
    diff: CodeDiff,
    originalDocument: vscode.TextDocument,
    modifiedDocument: vscode.TextDocument,
    cursorPosition: vscode.Position,
  ): vscode.InlineCompletionItem | undefined {
    const { changes } = diff;

    if (changes.length !== 1) {
      logger.debug(
        "Can not be represented as a single InlineCompletionItem, (changes.length !== 1): ",
        { changes },
      );
      return undefined;
    }

    const change = changes[0];
    if (change.original.start !== cursorPosition.line) {
      logger.debug(
        "Can not be represented as a single InlineCompletionItem, (change.original.start !== cursorPosition.line): ",
        { changes, cursorPosition },
      );
      return undefined;
    }

    if (change.original.end !== change.original.start + 1) {
      logger.debug(
        "Can not be represented as a single InlineCompletionItem, (change.original.end !== change.original.start + 1): ",
        { changes },
      );
      return undefined;
    }

    if (change.modified.end === change.modified.start) {
      logger.debug(
        "Can not be represented as a single InlineCompletionItem, (change.modified.end === change.modified.start): ",
        { changes },
      );
      return undefined;
    }

    const originalText = originalDocument.lineAt(change.original.start).text;
    const editedText = modifiedDocument.getText(
      lineNumberRangeToPositionRange(change.modified, modifiedDocument),
    );
    const originalPrefix = originalText.slice(0, cursorPosition.character);
    const editedPrefix = editedText.slice(0, cursorPosition.character);
    if (originalPrefix !== editedPrefix) {
      logger.debug(
        "Can not be represented as a single InlineCompletionItem, (originalPrefix !== editedPrefix): ",
        { originalText, editedText, cursorPosition },
      );
      return undefined;
    }

    const originalSuffix = originalText.slice(cursorPosition.character);
    const editedSuffix = editedText.slice(cursorPosition.character);
    if (originalSuffix.length > editedSuffix.length) {
      logger.debug(
        "Can not be represented as a single InlineCompletionItem, (originalSuffix.length > editedSuffix.length): ",
        { originalText, editedText, cursorPosition },
      );
      return undefined;
    }

    // Find the length of the same suffix
    let sameSuffixLength = 0;
    while (
      originalSuffix.length - 1 - sameSuffixLength >= 0 &&
      editedSuffix.length - 1 - sameSuffixLength >= 0 &&
      originalSuffix[originalSuffix.length - 1 - sameSuffixLength] ===
        editedSuffix[editedSuffix.length - 1 - sameSuffixLength]
    ) {
      sameSuffixLength++;
    }
    const removedText = originalSuffix.slice(
      0,
      originalSuffix.length - sameSuffixLength,
    );
    const insertedText = editedSuffix.slice(
      0,
      editedSuffix.length - sameSuffixLength,
    );
    if (!isSubsequence(removedText, insertedText)) {
      logger.debug(
        "Can not be represented as a single InlineCompletionItem, (!isSubsequence(removedText, insertedText)): ",
        { originalText, editedText, cursorPosition, removedText, insertedText },
      );
      return undefined;
    }

    const rangeBefore = new vscode.Range(
      cursorPosition,
      cursorPosition.translate(0, removedText.length),
    );
    const lines = insertedText.split("\n");
    const rangeAfter = new vscode.Range(
      cursorPosition,
      lines.length > 1
        ? new vscode.Position(
            cursorPosition.line + lines.length - 1,
            lines[lines.length - 1].length,
          )
        : cursorPosition.translate(0, insertedText.length),
    );

    const onDidAcceptParams: OnDidAcceptInlineCompletionItemParams = {
      hash: this.context.hash,
      requestId: this.responseItem.requestId,
      insertedText,
      rangeBefore,
      rangeAfter,
    };

    return new vscode.InlineCompletionItem(insertedText, rangeBefore, {
      title: "Code Completion Accepted",
      command: "pochi.tabCompletion.onDidAccept",
      arguments: [onDidAcceptParams],
    });
  }
}

export interface OnDidAcceptInlineCompletionItemParams {
  hash: string;
  requestId: string;
  insertedText: string;
  rangeBefore: vscode.Range;
  rangeAfter: vscode.Range;
}

function shouldSkipChange(
  change: RangeMapping,
  originalDocument: vscode.TextDocument,
  modifiedDocument: vscode.TextDocument,
): boolean {
  return (
    isAddingBlankLines(change, originalDocument, modifiedDocument) ||
    isRemovingBlankLines(change, originalDocument, modifiedDocument)
  );
}

function isAddingBlankLines(
  change: RangeMapping,
  originalDocument: vscode.TextDocument,
  modifiedDocument: vscode.TextDocument,
): boolean {
  const { original, modified } = change;
  if (
    original.start.isEqual(modified.end) &&
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

function isRemovingBlankLines(
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

function isSubsequence(small: string, large: string): boolean {
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
