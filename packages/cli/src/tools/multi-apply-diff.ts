import * as fs from "node:fs/promises";
import { processMultipleDiffs } from "@getpochi/common/diff-utils";
import { resolvePath, validateTextFile } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import { ensureFileDirectoryExists } from "../lib/fs";

/**
 * Apply multiple diff operations to a file using DiffView
 */
export const multiApplyDiff =
  (): ToolFunctionType<ClientTools["multiApplyDiff"]> =>
  async ({ path, edits }, { cwd }) => {
    const fileUri = resolvePath(path, cwd);
    await ensureFileDirectoryExists(fileUri);

    const fileBuffer = await fs.readFile(fileUri);
    validateTextFile(fileBuffer);
    const fileContent = fileBuffer.toString();

    const updatedContent = await processMultipleDiffs(fileContent, edits);
    await fs.writeFile(fileUri, updatedContent);

    return { success: true };
  };
