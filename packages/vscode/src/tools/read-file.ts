import {
  isPlainText,
  readMediaFile,
  selectFileContent,
} from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import * as vscode from "vscode";
import { resolveFileUri } from "../lib/fs";

export const readFile: ToolFunctionType<ClientTools["readFile"]> = async (
  { path, startLine, endLine },
  { cwd, contentType, task },
) => {
  const fileUri = resolveFileUri(path, { cwd, task });
  const resolvedPath = fileUri.fsPath;

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
