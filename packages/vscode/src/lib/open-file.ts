import * as os from "node:os";
import path from "node:path";
import { getLogger } from "@/lib/logger";
import { isPlainTextFile } from "@getpochi/common/tool-utils";
import * as vscode from "vscode";

const logger = getLogger("openFile");

const fileSystemErrorCode = {
  fileNotFound: vscode.FileSystemError.FileNotFound().code,
  fileExists: vscode.FileSystemError.FileExists().code,
  fileNotADirectory: vscode.FileSystemError.FileNotADirectory().code,
  fileIsADirectory: vscode.FileSystemError.FileIsADirectory().code,
  noPermissions: vscode.FileSystemError.NoPermissions().code,
  unavailable: vscode.FileSystemError.Unavailable().code,
} as const;

const fileSystemErrorMessages: Record<string, string> = {
  [fileSystemErrorCode.fileNotFound]: "File not found",
  [fileSystemErrorCode.fileExists]: "File already exists",
  [fileSystemErrorCode.fileNotADirectory]: "Not a directory",
  [fileSystemErrorCode.fileIsADirectory]: "Is a directory",
  [fileSystemErrorCode.noPermissions]: "No permissions to access file",
  [fileSystemErrorCode.unavailable]: "File system unavailable",
};

const getFileSystemErrorCode = (error: unknown): string | undefined => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
};

const isFileNotFoundError = (error: unknown): boolean =>
  getFileSystemErrorCode(error) === fileSystemErrorCode.fileNotFound;

const showFileSystemError = (filePath: string, error: unknown): void => {
  const errorCode = getFileSystemErrorCode(error);
  const message = errorCode
    ? (fileSystemErrorMessages[errorCode] ?? "Failed to access file")
    : "Failed to access file";

  logger.error(`${message}: ${filePath}`, error);
  void vscode.window.showErrorMessage(`${message}: ${filePath}`);
};

export type OpenFileOptions = {
  start?: number;
  end?: number;
  preserveFocus?: boolean;
  base64Data?: string;
  fallbackGlobPattern?: string;
  cellId?: string;
};

export const openFile = async (
  filePath: string,
  cwd: string | null | undefined,
  options?: OpenFileOptions,
): Promise<void> => {
  let fileUri = vscode.Uri.parse(filePath);
  let resolvedPath = filePath;

  // Open file directly if it's a pochi scheme
  if (fileUri.scheme === "pochi") {
    vscode.commands.executeCommand(
      "vscode.open",
      vscode.Uri.parse(resolvedPath),
    );
    return;
  }

  // Expand ~ to home directory if present
  if (resolvedPath.startsWith("~/")) {
    resolvedPath = resolvedPath.replace(/^~/, os.homedir());
  }

  fileUri = path.isAbsolute(resolvedPath)
    ? vscode.Uri.file(resolvedPath)
    : cwd
      ? vscode.Uri.joinPath(vscode.Uri.file(cwd), resolvedPath)
      : vscode.Uri.file(resolvedPath);

  let stat: vscode.FileStat;
  try {
    stat = await vscode.workspace.fs.stat(fileUri);
  } catch (error) {
    if (!isFileNotFoundError(error)) {
      showFileSystemError(filePath, error);
      return;
    }

    logger.info("File not found, trying to open from base64 data", error);
    let fallbackError: unknown = error;

    if (options?.base64Data !== undefined) {
      const tempFile = vscode.Uri.file(path.join(os.tmpdir(), fileUri.path));
      let didWriteTempFile = false;
      try {
        await vscode.workspace.fs.writeFile(
          tempFile,
          Buffer.from(options.base64Data, "base64"),
        );
        didWriteTempFile = true;
      } catch (error) {
        fallbackError = error;
        logger.error(`Failed to write file from base64 data: ${error}`);
      }

      if (didWriteTempFile) {
        await vscode.commands.executeCommand("vscode.open", tempFile);
        return;
      }
    }

    if (options?.fallbackGlobPattern) {
      let result: readonly vscode.Uri[] | undefined;
      try {
        result = await vscode.workspace.findFiles(
          options.fallbackGlobPattern,
          null,
          1,
        );
      } catch (error) {
        fallbackError = error;
        logger.error(`Failed to find file by glob pattern: ${error}`);
      }

      logger.info("found file by glob pattern", result?.[0]);

      if (result && result.length > 0) {
        await vscode.commands.executeCommand("vscode.open", result[0]);
        return;
      }
    }

    showFileSystemError(filePath, fallbackError);
    return;
  }

  if (stat.type === vscode.FileType.Directory) {
    await vscode.commands.executeCommand("revealInExplorer", fileUri);
    await vscode.commands.executeCommand("list.expand");
  } else if (stat.type === vscode.FileType.File) {
    if (fileUri.fsPath.endsWith(".ipynb")) {
      await vscode.commands.executeCommand(
        "vscode.openWith",
        fileUri,
        "jupyter-notebook",
      );

      if (options?.cellId) {
        const notebook = vscode.workspace.notebookDocuments.find(
          (item) => item.uri.toString() === fileUri.toString(),
        );
        if (!notebook) return;
        const cellIndex = notebook
          .getCells()
          .findIndex((cell) => cell.metadata?.id === options.cellId);
        if (cellIndex < 0) return;
        const editor = vscode.window.visibleNotebookEditors.find(
          (item) => item.notebook.uri.toString() === fileUri.toString(),
        );
        if (!editor) return;
        editor.selection = new vscode.NotebookRange(cellIndex, cellIndex + 1);
        await vscode.commands.executeCommand("notebook.cell.edit");
      }
      return;
    }

    const isPlainText = await isPlainTextFile(fileUri.fsPath);
    if (!isPlainText) {
      await vscode.commands.executeCommand("vscode.open", fileUri);
    } else {
      const start = options?.start ?? 1;
      const end = options?.end ?? start;
      vscode.window.showTextDocument(fileUri, {
        selection: new vscode.Range(start - 1, 0, end - 1, 0),
        preserveFocus: options?.preserveFocus,
      });
    }
  }
};
