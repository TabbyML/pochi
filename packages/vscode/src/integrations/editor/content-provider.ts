import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

@injectable()
@singleton()
export class ContentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  static readonly scheme = "pochi-content";

  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  private readonly content = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.content.get(uri.toString()) || "";
  }

  public update(uri: vscode.Uri, content: string) {
    this.content.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  private registration = vscode.workspace.registerTextDocumentContentProvider(
    ContentProvider.scheme,
    this,
  );

  dispose() {
    this.registration.dispose();
  }
}
