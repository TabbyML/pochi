import { getLogger } from "@/lib/logger";
import * as vscode from "vscode";
import { DocumentSelector } from "../utils";
import type { BaseTriggerEvent, TabCompletionTrigger } from "./types";

const logger = getLogger(
  "TabCompletion.Triggers.InlineCompletionProviderTrigger",
);

export interface InlineCompletionProviderTriggerEvent extends BaseTriggerEvent {
  kind: "inline-completion";
  isManually: boolean | undefined;
  resolve: (result: vscode.InlineCompletionList | undefined) => void;
}

export class InlineCompletionProviderTrigger
  implements
    vscode.InlineCompletionItemProvider,
    TabCompletionTrigger<InlineCompletionProviderTriggerEvent>,
    vscode.Disposable
{
  private disposables: vscode.Disposable[] = [];
  private tokenSource: vscode.CancellationTokenSource | undefined;

  private readonly triggerEventEmitter =
    new vscode.EventEmitter<InlineCompletionProviderTriggerEvent>();
  public readonly onTrigger = this.triggerEventEmitter.event;

  constructor() {
    this.disposables.push(this.triggerEventEmitter);
    this.disposables.push(
      vscode.languages.registerInlineCompletionItemProvider(
        DocumentSelector,
        this,
      ),
    );
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context?: vscode.InlineCompletionContext | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<vscode.InlineCompletionList | undefined> {
    logger.trace("provideInlineCompletionItems", {
      document,
      position,
      context,
      token,
    });

    if (this.tokenSource) {
      this.tokenSource.cancel();
      this.tokenSource.dispose();
      this.tokenSource = undefined;
    }

    if (token?.isCancellationRequested) {
      return undefined;
    }

    const tokenSource = new vscode.CancellationTokenSource();
    if (token) {
      token.onCancellationRequested(() => tokenSource.cancel());
    }
    const cancellationToken = tokenSource.token;
    this.tokenSource = tokenSource;

    let selection = new vscode.Selection(position, position);
    const activeTextEditor = vscode.window.activeTextEditor;
    if (activeTextEditor?.document === document) {
      selection = activeTextEditor.selection;
    }

    return new Promise<vscode.InlineCompletionList | undefined>((resolve) => {
      cancellationToken.onCancellationRequested(() => {
        resolve(undefined);
        tokenSource.dispose();
        if (this.tokenSource === tokenSource) {
          this.tokenSource = undefined;
        }
      });
      logger.trace(`Trigger event, document: ${document.uri.toString()}`);
      this.triggerEventEmitter.fire({
        kind: "inline-completion",
        document,
        selection,
        selectedCompletionInfo: context?.selectedCompletionInfo,
        token: cancellationToken,
        isManually:
          context?.triggerKind === vscode.InlineCompletionTriggerKind.Invoke,
        resolve: (result) => {
          resolve(result);
          tokenSource.dispose();
          if (this.tokenSource === tokenSource) {
            this.tokenSource = undefined;
          }
        },
      });
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
