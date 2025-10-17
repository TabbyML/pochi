import * as fs from "node:fs/promises";
import {
  buildImageContent,
  resolvePath,
  selectFileContent,
  validateTextFile,
} from "@getpochi/common/tool-utils";

import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const readFile =
  (): ToolFunctionType<ClientTools["readFile"]> =>
  async ({ path, startLine, endLine }, { cwd, supportedMimeTypes }) => {
    const resolvedPath = resolvePath(path, cwd);
    const fileBuffer = await fs.readFile(resolvedPath);

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
