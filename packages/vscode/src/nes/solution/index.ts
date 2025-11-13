import { StaticTextDocument } from "@/code-completion/utils/static-text-document";
import { isBlank, isMultiLine } from "@/code-completion/utils/strings";
import { getLogger } from "@/lib/logger";
import { diffLines, diffWords } from "diff";
import * as vscode from "vscode";
import {
  EditableRegionPrefixLine,
  EditableRegionSuffixLine,
} from "../constants";
import type { NESRequestContext } from "../contexts";
import type { NESResponseItem, TextContentChange } from "../types";
import { applyEdit } from "../utils";
import { checkRevertingLastEdit } from "./filters/check-reverting-last-edit";
import { checkTextDuplication } from "./filters/check-text-duplication";
import { asInlineCompletionItem } from "./inline-completion-item";
import type { NESSolution } from "./type";

const logger = getLogger("NES.Solution");

export type { NESSolution } from "./type";

export function calculateSolution(
  context: NESRequestContext,
  item: NESResponseItem,
): NESSolution | undefined {
  const { document, selection } = context.documentContext;
  const changes: TextContentChange[] = [];

  const cursorPosition = selection.active;
  const editableRegionStart = new vscode.Position(
    Math.max(0, cursorPosition.line - EditableRegionPrefixLine),
    0,
  );
  const editableRegionEnd = new vscode.Position(
    Math.min(
      document.lineCount,
      cursorPosition.line + 1 + EditableRegionSuffixLine,
    ),
    0,
  );
  const editableRegion = new vscode.Range(
    editableRegionStart,
    editableRegionEnd,
  );
  const editableRegionText = document.getText(editableRegion);
  const editableRegionOffset = document.offsetAt(editableRegionStart);

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
            document.positionAt(currentOffset),
            document.positionAt(currentOffset),
          ),
          rangeOffset: currentOffset,
          rangeLength: 0,
          text: part.value,
        });
      }
    } else if (part.removed) {
      changes.push({
        range: new vscode.Range(
          document.positionAt(currentOffset),
          document.positionAt(currentOffset + part.value.length),
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
            document.positionAt(change.rangeOffset + change.rangeLength - 1),
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
          isLineEndPosition(change.range.start, document)) &&
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
        document.lineAt(change.range.start.line).isEmptyOrWhitespace &&
        change.text === ""
      ) {
        return false;
      }

      return true;
    });

  if (refinedChanges.length < 1) {
    // No changes after filters
    return undefined;
  }

  // find the changed lines range
  const originalText = document.getText();
  const { text: editedText, editedRanges } = applyEdit(
    originalText,
    refinedChanges,
  );
  const target = new StaticTextDocument(
    document.uri,
    document.languageId,
    0,
    originalText,
  );

  const beforeLines = originalText.split("\n");
  const afterLines = editedText.split("\n");
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
  const changedRange = new vscode.Range(
    new vscode.Position(unchangedLinesFromStart, 0),
    new vscode.Position(
      beforeLines.length - 1 - unchangedLinesFromEnd,
      beforeLines[beforeLines.length - 1 - unchangedLinesFromEnd].length,
    ),
  );
  const changedText = afterLines
    .slice(unchangedLinesFromStart, afterLines.length - unchangedLinesFromEnd)
    .join("\n");
  const change: TextContentChange = {
    range: changedRange,
    rangeOffset: document.offsetAt(changedRange.start),
    rangeLength:
      document.offsetAt(changedRange.end) -
      document.offsetAt(changedRange.start),
    text: changedText,
  };

  if (checkRevertingLastEdit(context, target)) {
    return undefined;
  }

  if (checkTextDuplication(context, change)) {
    return undefined;
  }

  const inlineCompletionItem = asInlineCompletionItem(context, change);

  if (inlineCompletionItem) {
    return {
      context,
      target,
      change,
      edit: {
        type: "inline-completion",
        inlineCompletionItem,
      },
    };
  }

  return {
    context,
    target,
    change,
    edit: {
      type: "text-changes",
      changes: refinedChanges,
      editedRanges,
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
