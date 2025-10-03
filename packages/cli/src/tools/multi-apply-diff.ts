import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { processMultipleDiffs } from "@getpochi/common/diff-utils";
import { validateTextFile } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import { ensureFileDirectoryExists } from "../lib/fs";

/**
 * Apply multiple diff operations to a file using DiffView
 */
export const multiApplyDiff =
  (): ToolFunctionType<ClientTools["multiApplyDiff"]> =>
  async ({ path, edits }, { cwd }) => {
    const fileUri = nodePath.join(cwd, path);
    await ensureFileDirectoryExists(fileUri);

    const fileBuffer = await fs.readFile(fileUri);
    validateTextFile(fileBuffer);
    const fileContent = fileBuffer.toString();

    const updatedContent = await processMultipleDiffs(fileContent, edits);
    await fs.writeFile(fileUri, updatedContent);

    return { success: true };
  };
