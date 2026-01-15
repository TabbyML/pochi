import hashObject from "object-hash";
import * as vscode from "vscode";
import {
  DocumentSelector,
  type TextDocumentEditStep,
  type TextDocumentSnapshot,
  createTextDocumentSnapshot,
} from "./utils";

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
    this.documentSnapshot = createTextDocumentSnapshot(document);
    this.hash = hashObject({
      document: {
        uri: document.uri.toString(),
        text: document.getText(),
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
        this.editHistory?.map((step) => {
          return {
            before: step.getBefore().getText(),
            after: step.getAfter().getText(),
          };
        }) ?? [],
      otherDocuments: vscode.workspace.textDocuments
        .filter((doc) => doc.uri.toString() !== document.uri.toString())
        .filter((doc) => vscode.languages.match(DocumentSelector, doc))
        .map((doc) => ({
          uri: doc.uri.toString(),
          version: doc.version,
        })),
    });
  }
}
