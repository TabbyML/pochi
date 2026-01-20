import { TextDecoder, TextEncoder } from "node:util";
import { PochiWebviewPanel } from "@/integrations/webview/webview-panel";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

@injectable()
@singleton()
export class PochiFileSystemProvider
  implements vscode.FileSystemProvider, vscode.Disposable
{
  private _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._onDidChangeFile.event;

  constructor(
    @inject("vscode.ExtensionContext")
    context: vscode.ExtensionContext,
  ) {
    // Pochi tabs opened before PochiFileSystemProvider initialization will error, so they need to be closed.
    PochiFileSystemProvider.closePochiTabs();
    context.subscriptions.push(
      vscode.workspace.registerFileSystemProvider("pochi", this, {
        isCaseSensitive: true,
        isReadonly: false,
      }),
    );
  }

  static closePochiTabs(uid?: string) {
    const tabsToClose: vscode.Tab[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputText) {
          if (
            tab.input.uri.scheme === "pochi" &&
            (uid === undefined || tab.input.uri.authority === uid)
          ) {
            tabsToClose.push(tab);
          }
        }
      }
    }

    if (tabsToClose.length > 0) {
      vscode.window.tabGroups.close(tabsToClose);
    }
  }

  watch(
    _uri: vscode.Uri,
    _options: { recursive: boolean; excludes: string[] },
  ): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const taskId = uri.authority;
    const filePath = uri.path;

    const content = await PochiWebviewPanel.readTaskFile(taskId, filePath);

    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: new TextEncoder().encode(content || "").length,
    };
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(): void {}

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const taskId = uri.authority;
    const filePath = uri.path;

    const content = await PochiWebviewPanel.readTaskFile(taskId, filePath);

    return new TextEncoder().encode(content || "");
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const taskId = uri.authority;
    const filePath = uri.path;

    const strContent = new TextDecoder().decode(content);

    await PochiWebviewPanel.writeTaskFile(taskId, filePath, strContent);
  }

  delete(): void {}

  rename(): void {}

  dispose() {
    this._onDidChangeFile.dispose();
  }
}
