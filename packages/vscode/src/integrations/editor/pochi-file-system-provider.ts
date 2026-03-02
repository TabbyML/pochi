import { TextDecoder, TextEncoder } from "node:util";
import { PochiWebviewPanel } from "@/integrations/webview/webview-panel";
import { decodeStoreId } from "@getpochi/common/store-id-utils";
import { decodeStoreIdFromUriAuthority } from "@getpochi/common/vscode-webui-bridge";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

@injectable()
@singleton()
export class PochiFileSystemProvider
  implements vscode.FileSystemProvider, vscode.Disposable
{
  private static matchTaskId(authority: string, taskId: string): boolean {
    const encodedStoreId = decodeStoreIdFromUriAuthority(authority);
    if (!encodedStoreId) {
      return false;
    }

    try {
      return decodeStoreId(encodedStoreId).taskId === taskId;
    } catch {
      return false;
    }
  }

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
            (uid === undefined ||
              PochiFileSystemProvider.matchTaskId(tab.input.uri.authority, uid))
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
    const storeId = decodeStoreIdFromUriAuthority(uri.authority);
    if (!storeId) {
      throw new Error("Invalid storeId");
    }
    const filePath = uri.path;

    const content = await PochiWebviewPanel.readStoreFile(storeId, filePath);

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
    const storeId = decodeStoreIdFromUriAuthority(uri.authority);
    if (!storeId) {
      throw new Error("Invalid storeId");
    }
    const filePath = uri.path;
    const content = await PochiWebviewPanel.readStoreFile(storeId, filePath);
    return new TextEncoder().encode(content || "");
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const storeId = decodeStoreIdFromUriAuthority(uri.authority);
    if (!storeId) {
      throw new Error("Invalid storeId");
    }
    const filePath = uri.path;
    const strContent = new TextDecoder().decode(content);
    await PochiWebviewPanel.writeStoreFile(storeId, filePath, strContent);
  }

  delete(): void {}

  rename(): void {}

  dispose() {
    this._onDidChangeFile.dispose();
  }
}
