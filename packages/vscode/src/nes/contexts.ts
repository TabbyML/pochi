import { createPatch } from "diff";
import hashObject from "object-hash";
import * as vscode from "vscode";
import {
  DocumentPrefixLine,
  DocumentSelector,
  DocumentSuffixLine,
  EditableRegionPrefixLine,
  EditableRegionSuffixLine,
} from "./constants";
import type { TextDocumentEditStep } from "./edit-history";

export interface NESContext {
  readonly document: vscode.TextDocument;
  readonly selection: vscode.Selection;
  readonly editHistory: TextDocumentEditStep[];
}

export interface NESContextSegments {
  edits: string[];
  filepath: string;
  prefix: string;
  editableRegionPrefix: string;
  editableRegionSuffix: string;
  suffix: string;
}

export function extractNESContextSegments(
  context: NESContext,
): NESContextSegments {
  const filepath = vscode.workspace.asRelativePath(context.document.uri);

  const edits = context.editHistory.map((step) => {
    const before = step.getBefore().getText();
    const after = step.getAfter().getText();
    if (before === after) {
      return "";
    }
    const patch = createPatch(filepath, before, after, "", "", {
      context: 2,
    });
    // Remove the header lines
    return patch.split("\n").slice(2).join("\n").trim();
  });

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
  const documentPrefixStart = new vscode.Position(
    Math.max(0, editableRegionStart.line - DocumentPrefixLine),
    0,
  );
  const documentSuffixEnd = new vscode.Position(
    Math.min(
      context.document.lineCount,
      editableRegionEnd.line + DocumentSuffixLine,
    ),
    0,
  );

  const prefix = context.document.getText(
    new vscode.Range(documentPrefixStart, editableRegionStart),
  );
  const editableRegionPrefix = context.document.getText(
    new vscode.Range(editableRegionStart, cursorPosition),
  );
  const editableRegionSuffix = context.document.getText(
    new vscode.Range(cursorPosition, editableRegionEnd),
  );
  const suffix = context.document.getText(
    new vscode.Range(editableRegionEnd, documentSuffixEnd),
  );

  return {
    edits,
    filepath,
    prefix,
    editableRegionPrefix,
    editableRegionSuffix,
    suffix,
  };
}

export function calculateNESContextHash(context: NESContext): string {
  return hashObject({
    document: {
      uri: context.document.uri.toString(),
      text: context.document.getText(),
      selection: context.selection,
    },
    editHistory: context.editHistory.map((step) => {
      return {
        before: step.getBefore().getText(),
        after: step.getAfter().getText(),
      };
    }),
    otherDocuments: vscode.workspace.textDocuments
      .filter((doc) => doc.uri.toString() !== context.document.uri.toString())
      .filter((doc) => vscode.languages.match(DocumentSelector, doc))
      .map((doc) => ({
        uri: doc.uri.toString(),
        version: doc.version,
      })),
  });
}
