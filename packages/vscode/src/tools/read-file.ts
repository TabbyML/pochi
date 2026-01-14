import {
  isPlainText,
  readMediaFile,
  resolvePath,
  selectFileContent,
} from "@getpochi/common/tool-utils";

import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import * as vscode from "vscode";

export const readFile: ToolFunctionType<ClientTools["readFile"]> = async (
  { path, startLine, endLine },
  { cwd, contentType },
) => {
  let resolvedPath: string;
  let fileUri: vscode.Uri;

  if (path.startsWith("pochi://")) {
    resolvedPath = path;
    fileUri = vscode.Uri.parse(path);
  } else {
    resolvedPath = resolvePath(path, cwd);
    fileUri = vscode.Uri.file(resolvedPath);
  }

  const fileBuffer = await vscode.workspace.fs.readFile(fileUri);

  const isPlainTextFile = isPlainText(fileBuffer);

  if (contentType && contentType.length > 0 && !isPlainTextFile) {
    return readMediaFile(resolvedPath, fileBuffer, contentType);
  }

  if (!isPlainTextFile) {
    throw new Error("Reading binary files is not supported.");
  }

  const fileContent = fileBuffer.toString();
  const addLineNumbers = !!process.env.VSCODE_TEST_OPTIONS;

  return selectFileContent(fileContent, {
    startLine,
    endLine,
    addLineNumbers,
  });
};
