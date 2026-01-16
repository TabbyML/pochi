import path, { join } from "node:path";
import { getLogger } from "@getpochi/common";
import { resolvePath } from "@getpochi/common/tool-utils";
import type { TaskContext } from "@getpochi/common/vscode-webui-bridge";
import * as diff from "diff";
import * as vscode from "vscode";

const logger = getLogger("Xusheng");

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

export const vscodeRipgrepPath = join(
  vscode.env.appRoot,
  "node_modules",
  "@vscode",
  "ripgrep",
  "bin",
  "rg",
);

export const asRelativePath = (
  uri: vscode.Uri | string,
  cwd: string,
): string => {
  if (typeof uri === "string") {
    return path.relative(cwd, uri);
  }
  return path.relative(cwd, uri.fsPath);
};

export const resolveFileUri = (
  path: string,
  options: { cwd?: string; taskContext?: TaskContext },
): vscode.Uri => {
  const { cwd = "", taskContext } = options;

  if (path.startsWith("pochi://")) {
    let resolvedPath = path;
    logger.info("taskContext", taskContext);
    if (taskContext) {
      resolvedPath = resolvedPath.replace(
        "pochi://self/",
        `pochi://${taskContext.taskId}/`,
      );
      resolvedPath = resolvedPath.replace(
        "pochi://parent/",
        `pochi://${taskContext.parentTaskId || taskContext.taskId}/`,
      );
    }
    logger.info("resolvedPath", resolvedPath);
    return vscode.Uri.parse(resolvedPath);
  }
  const resolvedPath = resolvePath(path, cwd);
  return vscode.Uri.file(resolvedPath);
};
