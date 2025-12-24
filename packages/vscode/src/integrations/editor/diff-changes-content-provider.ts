import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

interface DiffChangesData {
  filepath: string;
  content: string;
  cwd: string;
  type: "original" | "modified";
}

@injectable()
@singleton()
export class DiffChangesContentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  static readonly scheme = "pochi-diff-changes";

  static encode(data: DiffChangesData): vscode.Uri {
    const query = Buffer.from(JSON.stringify(data)).toString("base64");
    return vscode.Uri.parse(
      `${DiffChangesContentProvider.scheme}:${data.filepath}`,
    ).with({
      query,
    });
  }

  static decode(uri: vscode.Uri): DiffChangesData {
    const data = Buffer.from(uri.query, "base64").toString("utf-8");
    return JSON.parse(data) as DiffChangesData;
  }

  provideTextDocumentContent(uri: vscode.Uri) {
    return DiffChangesContentProvider.decode(uri).content;
  }

  private registeration = vscode.workspace.registerTextDocumentContentProvider(
    DiffChangesContentProvider.scheme,
    this,
  );

  dispose() {
    this.registeration.dispose();
  }
}
