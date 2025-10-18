import * as fs from "node:fs/promises";
import {
  isPlainText,
  readMediaFile,
  resolvePath,
  selectFileContent,
} from "@getpochi/common/tool-utils";

import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const readFile =
  (): ToolFunctionType<ClientTools["readFile"]> =>
  async ({ path, startLine, endLine }, { cwd, contentType }) => {
    const resolvedPath = resolvePath(path, cwd);
    const fileBuffer = await fs.readFile(resolvedPath);

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
