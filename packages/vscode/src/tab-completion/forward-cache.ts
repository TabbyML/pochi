import * as vscode from "vscode";
import { TabCompletionContext } from "./context";
import { TabCompletionSolution } from "./solution";
import {
  TextDocumentEditStep,
  type TextEdit,
  createTextDocumentSnapshotWithApplyEdit,
  splitLines,
} from "./utils";

const MaxForwardChars = 10;

export function generateForwardCache(
  solution: TabCompletionSolution,
  itemIndex?: number | undefined,
): TabCompletionSolution[] {
  const items =
    itemIndex === undefined ? solution.items : [solution.items[itemIndex]];
  const list: {
    append: string;
    newInsertText: string;
  }[] = [];
  for (const item of items) {
    if (!item.inlineCompletionItem) {
      continue;
    }
    const insertText = item.inlineCompletionItem.insertText as string;
    const lines = splitLines(insertText);
    const currentLine = lines[0] || "";

    const steps = Math.min(MaxForwardChars, currentLine.length);
    for (let chars = 1; chars < steps; chars++) {
      list.push({
        append: currentLine.slice(0, chars),
        newInsertText: insertText.slice(chars),
      });
    }
  }

  const grouped = new Map<
    string,
    {
      append: string;
      newInsertText: string;
    }[]
  >();
  for (const entry of list) {
    if (!grouped.has(entry.append)) {
      grouped.set(entry.append, []);
    }
    grouped.get(entry.append)?.push(entry);
  }

  return grouped
    .entries()
    .map(([append, entries]) => {
      const newContext = createForwardContext(solution.context, append);
      const offset = newContext.documentSnapshot.offsetAt(
        newContext.selection.active,
      );
      const newSolution = new TabCompletionSolution(newContext);
      for (const entry of entries) {
        newSolution.addItem({
          edit: {
            changes: [
              {
                range: { start: offset, end: offset },
                text: entry.newInsertText,
              },
            ],
          },
        });
      }
      return newSolution;
    })
    .toArray();
}

function createForwardContext(
  context: TabCompletionContext,
  append: string,
): TabCompletionContext {
  const { documentSnapshot, selection } = context;
  const offset = documentSnapshot.offsetAt(selection.active);

  const textEdit: TextEdit = {
    changes: [{ range: { start: offset, end: offset }, text: append }],
  };
  const newDocumentSnapshot = createTextDocumentSnapshotWithApplyEdit(
    documentSnapshot,
    textEdit,
  );

  const newOffset = offset + append.length;
  const newPosition = newDocumentSnapshot.positionAt(newOffset);
  const updatedSelection = new vscode.Selection(newPosition, newPosition);

  let editHistory: TextDocumentEditStep[] | undefined = undefined;
  if (context.editHistory && context.editHistory.length > 0) {
    editHistory = context.editHistory.slice(0, -1);

    const lastStep = context.editHistory[context.editHistory.length - 1];
    const before = lastStep.getBefore();
    const edits = lastStep.getEdits();
    const newEdits: TextEdit[] = [...edits, textEdit];
    const newLastStep = new TextDocumentEditStep(before, newEdits[0]);
    for (const edit of newEdits.slice(1)) {
      newLastStep.appendEdit(edit);
    }
    editHistory.push(newLastStep);
  }

  return new TabCompletionContext(
    newDocumentSnapshot,
    updatedSelection,
    context.selectedCompletionInfo,
    editHistory,
    context.notebookCells,
    false,
  );
}
