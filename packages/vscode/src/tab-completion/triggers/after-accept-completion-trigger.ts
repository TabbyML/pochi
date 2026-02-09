import { getLogger } from "@/lib/logger";
import * as vscode from "vscode";
import { DocumentSelector } from "../utils";
import type { BaseTriggerEvent, TabCompletionTrigger } from "./types";

const logger = getLogger("TabCompletion.Triggers.AfterAcceptCompletionTrigger");

export interface AfterAcceptCompletionTriggerEvent extends BaseTriggerEvent {
  kind: "after-accept-completion";
}

export class AfterAcceptCompletionTrigger
  implements
    TabCompletionTrigger<AfterAcceptCompletionTriggerEvent>,
    vscode.Disposable
{
  private disposables: vscode.Disposable[] = [];
  private tokenSource: vscode.CancellationTokenSource | undefined;

  private readonly triggerEventEmitter =
    new vscode.EventEmitter<AfterAcceptCompletionTriggerEvent>();
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
  }

  fire(params: {
    document: vscode.TextDocument;
    selection: vscode.Selection;
  }) {
    if (this.tokenSource) {
      this.tokenSource.cancel();
      this.tokenSource.dispose();
      this.tokenSource = undefined;
    }
    const activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) {
      return;
    }
    const document = activeTextEditor.document;
    if (!vscode.languages.match(DocumentSelector, document)) {
      return;
    }
    if (params.document.uri.toString() !== document.uri.toString()) {
      return;
    }

    const tokenSource = new vscode.CancellationTokenSource();
    const token = tokenSource.token;
    this.tokenSource = tokenSource;

    logger.trace(`Trigger event, document: ${document.uri.toString()}`);
    this.triggerEventEmitter.fire({
      kind: "after-accept-completion",
      document,
      selection: params.selection,
      token,
    });
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
