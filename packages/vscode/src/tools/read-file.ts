import {
  buildImageContent,
  resolvePath,
  selectFileContent,
  validateTextFile,
} from "@getpochi/common/tool-utils";

import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import * as vscode from "vscode";

export const readFile: ToolFunctionType<ClientTools["readFile"]> = async (
  { path, startLine, endLine },
  { cwd, supportedMimeTypes },
) => {
  const resolvedPath = resolvePath(path, cwd);
  const fileUri = vscode.Uri.file(resolvedPath);

  const fileBuffer = await vscode.workspace.fs.readFile(fileUri);

  if (supportedMimeTypes && supportedMimeTypes.length > 0) {
    const imageContent = buildImageContent(
      resolvedPath,
      fileBuffer,
      supportedMimeTypes,
    );
    if (imageContent) {
      return imageContent;
    }
  }

  validateTextFile(fileBuffer);

  const fileContent = fileBuffer.toString();
  const addLineNumbers = !!process.env.VSCODE_TEST_OPTIONS;

  return selectFileContent(fileContent, {
    startLine,
    endLine,
    addLineNumbers,
  });
};
