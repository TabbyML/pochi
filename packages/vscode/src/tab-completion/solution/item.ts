import { getLogger } from "@/lib/logger";
import * as vscode from "vscode";
import { linesDiffComputers } from "vscode-diff";
import type { TabCompletionContext } from "../context";
import type { TabCompletionProviderResponseItem } from "../providers/types";
import {
  type CodeDiff,
  type LineRangeMapping,
  LinesDiffOptions,
  type TextDocumentSnapshot,
  type TextEdit,
  createTextDocumentSnapshotWithApplyEdit,
  getLines,
  lineNumberRangeToPositionRange,
  mergeRanges,
  toCodeDiff,
} from "../utils";

const logger = getLogger("TabCompletion.Solution.Item");

export class TabCompletionSolutionItem {
  public readonly valid: boolean;
  public readonly target: TextDocumentSnapshot;
  public readonly diff: CodeDiff;
  public readonly textEdit: TextEdit;
  public readonly editRange: LineRangeMapping;
  public readonly inlineCompletionItem: vscode.InlineCompletionItem | undefined;

  constructor(
    public readonly context: TabCompletionContext,
    public readonly responseItem: TabCompletionProviderResponseItem,
  ) {
    const document = context.documentSnapshot;
    const targetDocument = createTextDocumentSnapshotWithApplyEdit(
      document,
      responseItem.edit,
    );

    const codeDiffResult = linesDiffComputers
      .getDefault()
      .computeDiff(
        getLines(document),
        getLines(targetDocument),
        LinesDiffOptions,
      );
    const diff = toCodeDiff(codeDiffResult);

    const editRange = {
      original: mergeRanges(diff.changes.map((c) => c.original)) ?? {
        start: 0,
        end: 0,
      },
      modified: mergeRanges(diff.changes.map((c) => c.modified)) ?? {
        start: 0,
        end: 0,
      },
    };

    const inlineCompletionItem = this.calculateInlineCompletionItem(
      diff,
      document,
      targetDocument,
      context.selection.active,
    );

    this.valid = document.content !== targetDocument.content;
    this.target = targetDocument;
    this.diff = diff;
    this.textEdit = responseItem.edit;
    this.editRange = editRange;
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
