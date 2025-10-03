import * as fs from "node:fs/promises";
import {
  resolvePath,
  selectFileContent,
  validateTextFile,
} from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const readFile =
  (): ToolFunctionType<ClientTools["readFile"]> =>
  async ({ path, startLine, endLine }, { cwd }) => {
    const resolvedPath = resolvePath(path, cwd);
    const fileBuffer = await fs.readFile(resolvedPath);
    validateTextFile(fileBuffer);
    const fileContent = fileBuffer.toString();

    const addLineNumbers = !!process.env.VSCODE_TEST_OPTIONS;

    return selectFileContent(fileContent, {
      startLine,
      endLine,
      addLineNumbers,
    });
  };
