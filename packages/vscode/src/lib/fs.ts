import { join } from "node:path";
import * as diff from "diff";
import * as vscode from "vscode";

/**
 * Ensure a directory exists by creating it if needed
 */
export async function ensureFileDirectoryExists(
  fileUri: vscode.Uri,
): Promise<void> {
  const dirUri = vscode.Uri.joinPath(fileUri, "..");
  await vscode.workspace.fs.createDirectory(dirUri);
}

export async function isFileExists(fileUri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(fileUri);
    return true;
  } catch {
    return false;
  }
}

export function createPrettyPatch(
  filename = "file",
  oldStr?: string,
  newStr?: string,
) {
  const patch = diff.createPatch(filename, oldStr || "", newStr || "");
  const lines = patch.split("\n");
  const prettyPatchLines = lines.slice(4);
  return prettyPatchLines.join("\n");
}

/**
 * Generic file reader with error handling
 */
export async function readFileContent(
  filePath: string,
): Promise<string | null> {
  try {
    const fileUri = vscode.Uri.file(filePath);
    const fileContent = await vscode.workspace.fs.readFile(fileUri);
    return Buffer.from(fileContent).toString("utf8");
  } catch (error) {
    return null;
  }
}

/**
 * Generic directory reader with filtering
 */
export async function readDirectoryFiles(
  directoryUri: vscode.Uri,
  fileFilter: (name: string, type: vscode.FileType) => boolean,
): Promise<string[]> {
  try {
    const stat = await vscode.workspace.fs.stat(directoryUri);
    if (stat.type !== vscode.FileType.Directory) {
      return [];
    }

    const entries = await vscode.workspace.fs.readDirectory(directoryUri);
    const files: string[] = [];

    for (const [name, type] of entries) {
      if (fileFilter(name, type)) {
        const fileUri = vscode.Uri.joinPath(directoryUri, name);
        const relativePath = vscode.workspace.asRelativePath(fileUri);
        files.push(relativePath);
      }
    }

    return files;
  } catch (error) {
    return [];
  }
}

export const vscodeRipgrepPath = join(
  vscode.env.appRoot,
  "node_modules",
  "@vscode",
  "ripgrep",
  "bin",
  "rg",
);
