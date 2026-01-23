import { logToFileObject } from "@/lib/file-logger";
import { getLogger } from "@/lib/logger";
import { createPatch } from "diff";
import hashObject from "object-hash";
import * as vscode from "vscode";
import {
  DocumentSelector,
  type TextDocumentEditStep,
  type TextDocumentSnapshot,
  createTextDocumentSnapshot,
} from "./utils";

const logger = getLogger("TabCompletion.Context");

export class TabCompletionContext {
  public readonly documentSnapshot: TextDocumentSnapshot;
  public readonly hash: string;

  constructor(
    public readonly document: vscode.TextDocument,
    public readonly selection: vscode.Selection,
    public readonly selectedCompletionInfo?:
      | vscode.SelectedCompletionInfo
      | undefined,
    public readonly editHistory?: readonly TextDocumentEditStep[] | undefined,
    public readonly notebookCells?: readonly vscode.TextDocument[] | undefined,
    public readonly isManually?: boolean | undefined,
  ) {
    const documentSnapshot = createTextDocumentSnapshot(document);
    this.documentSnapshot = documentSnapshot;
    this.hash = hashObject({
      document: {
        uri: documentSnapshot.uri.toString(),
        text: documentSnapshot.getText(),
      },
      selection: {
        anchor: {
          line: selection.anchor.line,
          character: selection.anchor.character,
        },
        active: {
          line: selection.active.line,
          character: selection.active.character,
        },
      },
      selectedCompletionInfo:
        selectedCompletionInfo !== undefined
          ? {
              text: selectedCompletionInfo.text,
            }
          : undefined,
      isManually: !!isManually,
      editHistory:
        editHistory?.map((step) => {
          return {
            before: step.getBefore().getText(),
            after: step.getAfter().getText(),
          };
        }) ?? [],
      otherDocuments: vscode.workspace.textDocuments
        .filter((doc) => doc.uri.toString() !== documentSnapshot.uri.toString())
        .filter((doc) => vscode.languages.match(DocumentSelector, doc))
        .map((doc) => ({
          uri: doc.uri.toString(),
          version: doc.version,
        })),
    });
  }

  logFullContext() {
    const {
      hash,
      documentSnapshot,
      selection,
      selectedCompletionInfo,
      isManually,
      editHistory,
      notebookCells,
    } = this;
    logger.debug(
      "Full context:",
      logToFileObject({
        hash,
        document: {
          uri: documentSnapshot.uri.toString(),
          text: documentSnapshot.getText(),
        },
        selection: {
          anchor: {
            line: selection.anchor.line,
            character: selection.anchor.character,
          },
          active: {
            line: selection.active.line,
            character: selection.active.character,
          },
        },
        selectedCompletionInfo:
          selectedCompletionInfo !== undefined
            ? {
                text: selectedCompletionInfo.text,
              }
            : undefined,
        isManually: !!isManually,
        editHistory:
          editHistory?.map((step) => {
            const before = step.getBefore().getText();
            const after = step.getAfter().getText();
            if (before === after) {
              return "";
            }
            const patch = createPatch("", before, after, "", "", {
              context: 0,
            });
            return patch.split("\n").slice(4).join("\n").trim();
          }) ?? [],
        notebookCells: notebookCells?.map((cell) => ({
          text: cell.getText(),
        })),
      }),
    );
  }
}
