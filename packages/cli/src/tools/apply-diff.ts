import * as fs from "node:fs/promises";
import { parseDiffAndApply } from "@getpochi/common/diff-utils";
import { resolvePath, validateTextFile } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import { ensureFileDirectoryExists } from "../lib/fs";

/**
 * Apply a diff to a file using DiffView
 */
export const applyDiff =
  (): ToolFunctionType<ClientTools["applyDiff"]> =>
  async (
    { path, searchContent, replaceContent, expectedReplacements },
    { cwd },
  ) => {
    const fileUri = resolvePath(path, cwd);
    await ensureFileDirectoryExists(fileUri);

    const fileBuffer = await fs.readFile(fileUri);
    validateTextFile(fileBuffer);
    const fileContent = fileBuffer.toString();

    const updatedContent = await parseDiffAndApply(
      fileContent,
      searchContent,
      replaceContent,
      expectedReplacements,
    );

    await fs.writeFile(fileUri, updatedContent);
    return { success: true };
  };
