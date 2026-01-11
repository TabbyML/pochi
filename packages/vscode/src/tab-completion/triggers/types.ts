import type * as vscode from "vscode";

export interface BaseTriggerEvent {
  document: vscode.TextDocument;
  selection: vscode.Selection;
  selectedCompletionInfo?: vscode.SelectedCompletionInfo | undefined;
  token?: vscode.CancellationToken | undefined;
}

export interface TabCompletionTrigger<T> {
  onTrigger: vscode.Event<T>;
}
