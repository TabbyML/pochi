import * as vscode from "vscode";
import { DiffChangesContentProvider } from "./diff-changes-content-provider";

export type FileChange = {
  // Relative filepath to cwd
  filepath: string;
  // if null, the file was created
  before: string | null;
  // if null, the file was deleted
  after: string | null;
};

export async function showDiffChanges(
  changedFiles: FileChange[],
  title: string,
  cwd: string,
  readModifiedFromFile = false, // set to true if the modified content is the same as the file on disk, will make modified editor editable
): Promise<boolean> {
  if (changedFiles.length === 0) {
    return false;
  }

  const getFileUri = (filepath: string) =>
    vscode.Uri.joinPath(vscode.Uri.file(cwd ?? ""), filepath);

  if (changedFiles.length === 1) {
    const changedFile = changedFiles[0];

    await vscode.commands.executeCommand(
      "vscode.diff",
      DiffChangesContentProvider.encode({
        filepath: getFileUri(changedFile.filepath).fsPath,
        content: changedFile.before ?? "",
        cwd: cwd,
        type: "original",
      }),
      readModifiedFromFile
        ? getFileUri(changedFile.filepath)
        : DiffChangesContentProvider.encode({
            filepath: getFileUri(changedFile.filepath).fsPath,
            content: changedFile.after ?? "",
            cwd: cwd,
            type: "modified",
          }),
      title,
      {
        preview: true,
        preserveFocus: true,
      },
    );
    return true;
  }

  await vscode.commands.executeCommand(
    "vscode.changes",
    title,
    changedFiles.map((file) => [
      getFileUri(file.filepath),
      DiffChangesContentProvider.encode({
        filepath: getFileUri(file.filepath).fsPath,
        content: file.before ?? "",
        cwd: cwd ?? "",
        type: "original",
      }),
      readModifiedFromFile
        ? getFileUri(file.filepath)
        : DiffChangesContentProvider.encode({
            filepath: getFileUri(file.filepath).fsPath,
            content: file.after ?? "",
            cwd: cwd ?? "",
            type: "modified",
          }),
    ]),
  );
  return true;
}
