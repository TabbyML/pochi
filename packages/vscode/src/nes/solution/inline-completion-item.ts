import { getLogger } from "@/lib/logger";
import * as vscode from "vscode";
import type { NESRequestContext } from "../contexts";
import type { TextContentChange } from "../types";

const logger = getLogger("NES.Solution.InlineCompletionItem");

// If the changes can be represented as a single InlineCompletionItem, return it.
// Otherwise, return undefined.
export function asInlineCompletionItem(
  context: NESRequestContext,
  change: TextContentChange,
): vscode.InlineCompletionItem | undefined {
  if (change.range.end.line > change.range.start.line) {
    logger.debug(
      "Can not be represented as a single InlineCompletionItem, the changes span multiple lines.",
    );
    return undefined;
  }

  const cursorPosition = context.documentContext.selection.active;
  if (change.range.start.line !== cursorPosition.line) {
    logger.debug(
      "Can not be represented as a single InlineCompletionItem, the change is not at the current line.",
    );
    return undefined;
  }

  const originalText = context.documentContext.document.lineAt(
    change.range.start.line,
  ).text;
  const editedText = change.text;

  const originalPrefix = originalText.slice(0, cursorPosition.character);
  const editedPrefix = editedText.slice(0, cursorPosition.character);
  if (originalPrefix !== editedPrefix) {
    logger.debug(
      "Can not be represented as a single InlineCompletionItem, the original text prefix does not match the edited text prefix.",
    );
    return undefined;
  }

  const originalSuffix = originalText.slice(cursorPosition.character);
  const editedSuffix = editedText.slice(cursorPosition.character);
  if (originalSuffix.length > editedSuffix.length) {
    logger.debug(
      "Can not be represented as a single InlineCompletionItem, the change is removing characters.",
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
      "Can not be represented as a single InlineCompletionItem, the edited text suffix does not contain the original text suffix.",
    );
    return undefined;
  }

  return new vscode.InlineCompletionItem(
    insertedText,
    new vscode.Range(
      cursorPosition,
      cursorPosition.translate(0, removedText.length),
    ),
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
