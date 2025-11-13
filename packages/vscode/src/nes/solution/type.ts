import type * as vscode from "vscode";
import type { NESRequestContext } from "../contexts";
import type { CharRange, TextContentChange } from "../types";

export interface NESSolution {
  /**
   * The solution is calculated based on this context.
   */
  context: NESRequestContext;

  /**
   * The edited text document.
   */
  target: vscode.TextDocument;

  /**
   * Represents the edit in one change.
   * The change range is full-lines (starts and ends at line-start or line-end) covering the edit.
   */
  change: TextContentChange;

  /**
   * The refined edit.
   * - inline-completion: The edit could be represented as an inline completion item.
   * - text-changes: The edit contains multiple text changes.
   */
  edit: InlineCompletionEdit | TextContentChangesEdit;
}

export interface InlineCompletionEdit {
  type: "inline-completion";
  inlineCompletionItem: vscode.InlineCompletionItem;
}

export interface TextContentChangesEdit {
  type: "text-changes";
  changes: readonly TextContentChange[];
  editedRanges: readonly CharRange[];
}
