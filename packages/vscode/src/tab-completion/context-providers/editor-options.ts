import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

export type EditorOptionsContext = {
  indentation: string;
};

@injectable()
@singleton()
export class EditorOptionsProvider {
  async getEditorOptions(
    uri: vscode.Uri,
    token?: vscode.CancellationToken | undefined,
  ): Promise<EditorOptionsContext | undefined> {
    if (token?.isCancellationRequested) {
      return undefined;
    }

    const editor = findTextEditor(uri);
    if (!editor) {
      return undefined;
    }

    const { insertSpaces, tabSize } = editor.options;

    let indentation: string | undefined;
    if (insertSpaces && typeof tabSize === "number" && tabSize > 0) {
      indentation = " ".repeat(tabSize);
    } else if (!insertSpaces) {
      indentation = "\t";
    }

    if (indentation === undefined) {
      return undefined;
    }

    return {
      indentation,
    };
  }
}

function findTextEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
  if (
    vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()
  ) {
    return vscode.window.activeTextEditor;
  }
  return vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.toString() === uri.toString(),
  );
}
