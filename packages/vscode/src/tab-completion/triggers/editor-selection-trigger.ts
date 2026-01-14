import { getLogger } from "@/lib/logger";
import * as vscode from "vscode";
import { DocumentSelector } from "../utils";
import type { BaseTriggerEvent, TabCompletionTrigger } from "./types";

const logger = getLogger("TabCompletion.Triggers.EditorSelectionTrigger");

export interface EditorSelectionTriggerEvent extends BaseTriggerEvent {
  kind: "editor-selection";
}

export class EditorSelectionTrigger
  implements
    TabCompletionTrigger<EditorSelectionTriggerEvent>,
    vscode.Disposable
{
  private disposables: vscode.Disposable[] = [];
  private tokenSource: vscode.CancellationTokenSource | undefined;

  private readonly triggerEventEmitter =
    new vscode.EventEmitter<EditorSelectionTriggerEvent>();
  public readonly onTrigger = this.triggerEventEmitter.event;

  constructor() {
    this.disposables.push(this.triggerEventEmitter);
    this.disposables.push(
      vscode.window.onDidChangeWindowState(() => {
        if (this.tokenSource) {
          this.tokenSource.cancel();
          this.tokenSource.dispose();
          this.tokenSource = undefined;
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (this.tokenSource) {
          this.tokenSource.cancel();
          this.tokenSource.dispose();
          this.tokenSource = undefined;
        }
      }),
    );
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(async (event) => {
        const document = event.textEditor.document;
        if (!vscode.languages.match(DocumentSelector, document)) {
          return;
        }

        if (this.tokenSource) {
          this.tokenSource.cancel();
          this.tokenSource.dispose();
          this.tokenSource = undefined;
        }

        if (
          (event.kind === vscode.TextEditorSelectionChangeKind.Mouse ||
            event.kind === vscode.TextEditorSelectionChangeKind.Keyboard) &&
          !isVimExtensionActive() &&
          event.selections.length > 0 &&
          event.selections.every((r) => document.getText(r).trim().length > 3)
        ) {
          // Trigger when user selects a range with mouse or keyboard
          const tokenSource = new vscode.CancellationTokenSource();
          const token = tokenSource.token;
          this.tokenSource = tokenSource;

          logger.trace(`Trigger event, document: ${document.uri.toString()}`);
          this.triggerEventEmitter.fire({
            kind: "editor-selection",
            document,
            selection: event.selections[0],
            token: token,
          });
        }
      }),
    );
  }

  dispose() {
    if (this.tokenSource) {
      this.tokenSource.cancel();
      this.tokenSource.dispose();
      this.tokenSource = undefined;
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

function isVimExtensionActive() {
  return vscode.extensions.getExtension("vscodevim.vim")?.isActive;
}
