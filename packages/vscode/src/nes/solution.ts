import { isBlank, isMultiLine } from "@/code-completion/utils/strings";
import { getLogger } from "@/lib/logger";
import { createPatch, diffLines, diffWords } from "diff";
import * as vscode from "vscode";
import {
  EditableRegionPrefixLine,
  EditableRegionSuffixLine,
} from "./constants";
import type { NESContext } from "./contexts";
import type { NESResponseItem, TextContentChange } from "./types";
import { applyEdit } from "./utils";

const logger = getLogger("NES.Solution");

export interface NESSolution {
  /**
   * The solution is calculated based on this context.
   */
  context: NESContext;

  /**
   * The LLM's response, including edited text.
   */
  responseItem: NESResponseItem;

  /**
   * The calculated changes to apply to the text document.
   */
  changes: readonly TextContentChange[];

  editableRegion: {
    /**
     * Editable region text before the changes.
     */
    before: string;

    /**
     * Editable region text after the changes.
     * This may not exactly equal the `responseItem.text`, adding/removing empty lines is ignored.
     */
    after: string;

    /**
     * The diff `between` before and `after`, line numbers are relative to the editable region.
     */
    diff: string;
  };
}

export function calculateSolution(
  context: NESContext,
  item: NESResponseItem,
): NESSolution {
  const changes: TextContentChange[] = [];

  const cursorPosition = context.selection.active;
  const editableRegionStart = new vscode.Position(
    Math.max(0, cursorPosition.line - EditableRegionPrefixLine),
    0,
  );
  const editableRegionEnd = new vscode.Position(
    Math.min(
      context.document.lineCount,
      cursorPosition.line + 1 + EditableRegionSuffixLine,
    ),
    0,
  );
  const editableRegion = new vscode.Range(
    editableRegionStart,
    editableRegionEnd,
  );
  const editableRegionText = context.document.getText(editableRegion);
  const editableRegionOffset = context.document.offsetAt(editableRegionStart);

  // Try to use word-based diff first
  let diff = diffWords(editableRegionText, item.text);
  logger.trace("Word diff", diff);

  if (diff.some((part) => part.added && isMultiLine(part.value))) {
    // If there are added multi-line changes, use line-based diff instead.
    diff = diffLines(editableRegionText, item.text);
    logger.trace("Line diff", diff);
  }

  let currentOffset = editableRegionOffset;
  for (const part of diff) {
    if (part.added) {
      const lastChange = changes[changes.length - 1];
      if (
        lastChange &&
        lastChange.rangeOffset + lastChange.rangeLength === currentOffset
      ) {
        // Merge with the previous change
        lastChange.text += part.value;
      } else {
        // New insertion
        changes.push({
          range: new vscode.Range(
            context.document.positionAt(currentOffset),
            context.document.positionAt(currentOffset),
          ),
          rangeOffset: currentOffset,
          rangeLength: 0,
          text: part.value,
        });
      }
    } else if (part.removed) {
      changes.push({
        range: new vscode.Range(
          context.document.positionAt(currentOffset),
          context.document.positionAt(currentOffset + part.value.length),
        ),
        rangeOffset: currentOffset,
        rangeLength: part.value.length,
        text: "",
      });
      currentOffset += part.value.length;
    } else {
      currentOffset += part.value.length;
    }
  }

  const refinedChanges = changes
    .map((change) => {
      // If the change range ends at the start of a line, and new text ends with a newline,
      // move the range end to the end of the previous line, remove trailing newline from new text
      if (
        change.range.end.line > change.range.start.line &&
        change.range.end.character === 0 &&
        change.text.endsWith("\n")
      ) {
        return {
          range: new vscode.Range(
            change.range.start,
            context.document.positionAt(
              change.rangeOffset + change.rangeLength - 1,
            ),
          ),
          rangeOffset: change.rangeOffset,
          rangeLength: change.rangeLength - 1,
          text: change.text.slice(0, -1),
        };
      }
      return change;
    })
    .filter((change) => {
      // Filter out: No change
      if (change.range.isEmpty && change.text.length === 0) {
        return false;
      }

      // Filter out: Add an empty line
      if (
        change.range.isEmpty &&
        (change.range.start.character === 0 ||
          isLineEndPosition(change.range.start, context.document)) &&
        change.text.endsWith("\n") &&
        isBlank(change.text)
      ) {
        return false;
      }

      // Filter out: Remove an empty line
      if (
        change.range.end.line === change.range.start.line + 1 &&
        change.range.start.character === 0 &&
        change.range.end.character === 0 &&
        context.document.lineAt(change.range.start.line).isEmptyOrWhitespace &&
        change.text === ""
      ) {
        return false;
      }

      return true;
    });

  // map changes range offset to editable region
  const convertedChanges = refinedChanges.map((c) => {
    return {
      range: new vscode.Range(
        c.range.start.translate(-editableRegionStart.line),
        c.range.end.translate(-editableRegionStart.line),
      ),
      rangeOffset: c.rangeOffset - editableRegionOffset,
      rangeLength: c.rangeLength,
      text: c.text,
    };
  });
  const { text: editableRegionTextAfterChange } = applyEdit(
    editableRegionText,
    convertedChanges,
  );

  const patch = createPatch(
    "",
    editableRegionText,
    editableRegionTextAfterChange,
    "",
    "",
    {
      context: 1,
      ignoreNewlineAtEof: true,
    },
  )
    .split("\n")
    .slice(4) // Remove the header lines
    .join("\n");

  return {
    context,
    responseItem: item,
    changes: refinedChanges,
    editableRegion: {
      before: editableRegionText,
      after: editableRegionTextAfterChange,
      diff: patch,
    },
  };
}

function isLineEndPosition(
  position: vscode.Position,
  document: vscode.TextDocument,
): boolean {
  const textLine = document.lineAt(position);
  return position.character === textLine.text.length;
}

export function isEmptySolution(solution: NESSolution) {
  return solution.changes.length === 0;
}

// If the changes can be represented as a single InlineCompletionItem, return it.
// Otherwise, return undefined.
export function asInlineCompletionItem(
  solution: NESSolution,
): vscode.InlineCompletionItem | undefined {
  const { context, editableRegion } = solution;

  // find the changed lines range
  const beforeLines = editableRegion.before.split("\n");
  const afterLines = editableRegion.after.split("\n");
  let unchangedLinesFromStart = 0;
  while (
    unchangedLinesFromStart < beforeLines.length &&
    unchangedLinesFromStart < afterLines.length &&
    beforeLines[unchangedLinesFromStart] === afterLines[unchangedLinesFromStart]
  ) {
    unchangedLinesFromStart++;
  }
  let unchangedLinesFromEnd = 0;
  while (
    beforeLines.length - 1 - unchangedLinesFromEnd > unchangedLinesFromStart &&
    afterLines.length - 1 - unchangedLinesFromEnd > unchangedLinesFromStart &&
    beforeLines[beforeLines.length - 1 - unchangedLinesFromEnd] ===
      afterLines[afterLines.length - 1 - unchangedLinesFromEnd]
  ) {
    unchangedLinesFromEnd++;
  }

  if (
    beforeLines.length - unchangedLinesFromStart - unchangedLinesFromEnd >
    1
  ) {
    logger.debug(
      "Can not be represented as a single InlineCompletionItem, the changes span multiple lines.",
    );
    return undefined;
  }

  if (afterLines.length - unchangedLinesFromStart - unchangedLinesFromEnd < 1) {
    logger.debug(
      "Can not be represented as a single InlineCompletionItem, the change is removing a line.",
    );
    return undefined;
  }

  const changedLineNumber = unchangedLinesFromStart;
  const cursorPosition = context.selection.active;

  // documentBaseLineNumber = editableRegionStartLine + changedLineNumber
  // editableRegionStartLine = cursorLineNumber - EditableRegionPrefixLine
  // We need documentBaseLineNumber === cursorLineNumber
  // =>  changedLineNumber === EditableRegionPrefixLine
  if (changedLineNumber !== EditableRegionPrefixLine) {
    logger.debug(
      "Can not be represented as a single InlineCompletionItem, the change is not at the current line.",
    );
    return undefined;
  }

  const originalText = beforeLines[changedLineNumber];
  const editedText = afterLines
    .slice(unchangedLinesFromStart, afterLines.length - unchangedLinesFromEnd)
    .join("\n");

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
