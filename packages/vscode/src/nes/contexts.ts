import { DeclarationSnippetsProvider } from "@/code-completion/context-provider";
import { cropTextToMaxChars } from "@/code-completion/utils/strings";
import { createPatch } from "diff";
import hashObject from "object-hash";
import { container } from "tsyringe";
import * as vscode from "vscode";
import { type CodeSnippet, deduplicateSnippets } from "./code-snippets";
import {
  DocumentPrefixLine,
  DocumentSelector,
  DocumentSuffixLine,
  EditableRegionPrefixLine,
  EditableRegionSuffixLine,
} from "./constants";
import type { TextDocumentEditStep } from "./edit-history";

export interface NESDocumentContext {
  readonly document: vscode.TextDocument;
  readonly selection: vscode.Selection;
  readonly editHistory: readonly TextDocumentEditStep[];
}

export interface NESPromptSegments {
  edits: string[];
  codeSnippets?: CodeSnippet[];

  filepath: string;
  prefix: string;
  editableRegionPrefix: string;
  editableRegionSuffix: string;
  suffix: string;
  editableRegionStart: number;
  editableRegionEnd: number;
}

export interface NESRequestContext {
  documentContext: NESDocumentContext;
  hash: string;
  promptSegments: NESPromptSegments;
}

// FIXME(zhiming): refactor to class
export async function buildNESRequestContext(
  documentContext: NESDocumentContext,
): Promise<NESRequestContext> {
  return {
    documentContext,
    hash: calculateNESContextHash(documentContext),
    promptSegments: await extractNESContextPromptSegments(documentContext),
  };
}

async function extractNESContextPromptSegments(
  context: NESDocumentContext,
): Promise<NESPromptSegments> {
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
  const editableRegionStartOffset =
    context.document.offsetAt(editableRegionStart);
  const editableRegionEndOffset = context.document.offsetAt(editableRegionEnd);

  // related code snippets
  let codeSnippets: CodeSnippet[] = [];
  const declarationSnippetsProvider = container.resolve(
    DeclarationSnippetsProvider,
  );
  try {
    const declarations = await declarationSnippetsProvider.collect(
      {
        uri: context.document.uri,
        range: new vscode.Range(documentPrefixStart, documentSuffixEnd),
      },
      5, // max snippets
      true,
      undefined,
    );
    if (declarations) {
      codeSnippets.push(
        ...declarations.map((snippet) => {
          return {
            kind: "declaration" as const,
            language: snippet.language,
            text: snippet.text,
            filepath: vscode.workspace.asRelativePath(snippet.uri),
            offset: snippet.offset,
            score: 1,
          };
        }),
      );
    }
  } catch (error) {
    // ignore errors
  }

  codeSnippets = deduplicateSnippets(codeSnippets);
  codeSnippets = codeSnippets.map((snippet) => ({
    ...snippet,
    text: cropTextToMaxChars(snippet.text, 2000),
  }));

  return {
    edits,
    codeSnippets,
    filepath,
    prefix,
    editableRegionPrefix,
    editableRegionSuffix,
    suffix,
    editableRegionStart: editableRegionStartOffset,
    editableRegionEnd: editableRegionEndOffset,
  };
}

function calculateNESContextHash(context: NESDocumentContext): string {
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
