import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { parseDiffAndApply } from "@getpochi/common/diff-utils";
import { validateTextFile } from "@getpochi/common/tool-utils";
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
    const fileUri = nodePath.join(cwd, path);
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
