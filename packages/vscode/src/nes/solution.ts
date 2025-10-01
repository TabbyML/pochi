import { isMultiLine } from "@/code-completion/utils/strings";
import { createPatch, diffLines, diffWords } from "diff";
import * as vscode from "vscode";
import {
  EditableRegionPrefixLine,
  EditableRegionSuffixLine,
} from "./constants";
import type { NESContext } from "./contexts";
import type { NESResponseItem, TextContentChange } from "./types";

export interface NESSolution {
  context: NESContext;
  item: NESResponseItem;
  changes: readonly TextContentChange[];
  patch: string; // in diff format
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

  if (diff.some((part) => part.added && isMultiLine(part.value))) {
    // If there are added multi-line changes, use line-based diff instead.
    diff = diffLines(editableRegionText, item.text, {
      ignoreWhitespace: true,
    });
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

  const filteredChanges = changes
    .map((change) => {
      if (
        change.range.end.line > change.range.start.line &&
        change.range.end.character === 0 &&
        change.text.endsWith("\n")
      ) {
        // If the change ends at the start of a line, move it to the end of the previous line.
        const newEnd = context.document.positionAt(
          change.rangeOffset + change.rangeLength - 1,
        );
        const newRange = new vscode.Range(change.range.start, newEnd);
        return {
          range: newRange,
          rangeOffset: change.rangeOffset,
          rangeLength: change.rangeLength - 1, // Remove the newline character
          text: change.text.slice(0, -1), // Remove the newline character
        };
      }
      return change;
    })
    .filter((change) => change.rangeLength > 0 || change.text.length > 0);

  const patch = createPatch("", editableRegionText, item.text, "", "", {
    context: 0,
    ignoreNewlineAtEof: true,
  })
    // Remove the header lines
    .split("\n")
    .slice(4)
    .join("\n");

  return {
    context,
    item,
    changes: filteredChanges,
    patch,
  };
}

// If the changes can be represented as a single InlineCompletionItem, return it.
// Otherwise, return undefined.
export function asInlineCompletionItem(
  solution: NESSolution,
): vscode.InlineCompletionItem | undefined {
  const { context, changes } = solution;
  if (changes.length !== 1) {
    // Multiple changes, cannot represent as a single InlineCompletionItem
    return undefined;
  }

  const cursorPosition = context.selection.active;
  const change = changes[0];
  if (!change.range.contains(cursorPosition)) {
    // The change does not contain the cursor position
    return undefined;
  }
  if (
    change.range.start.line !== cursorPosition.line ||
    change.range.end.line !== cursorPosition.line
  ) {
    // The change spans multiple lines
    return undefined;
  }

  const prefix = context.document.getText(
    new vscode.Range(change.range.start, cursorPosition),
  );
  if (change.text.slice(0, prefix.length) !== prefix) {
    // The change text does not start with the prefix
    return undefined;
  }

  const suffix = context.document.getText(
    new vscode.Range(cursorPosition, change.range.end),
  );
  if (!isSubsequence(suffix, change.text.slice(prefix.length))) {
    // The change text does not contain the suffix
    return undefined;
  }

  const newText = change.text.slice(prefix.length);
  return new vscode.InlineCompletionItem(
    newText,
    new vscode.Range(cursorPosition, change.range.end),
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
