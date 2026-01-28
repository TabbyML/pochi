import {
  isPlainText,
  readMediaFile,
  selectFileContent,
} from "@getpochi/common/tool-utils";

import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const readFile =
  ({
    fileSystem,
  }: ToolCallOptions): ToolFunctionType<ClientTools["readFile"]> =>
  async ({ path, startLine, endLine }, { contentType }) => {
    const fileBuffer = await fileSystem.readFile(path);
    const resolvedPath = path;

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
