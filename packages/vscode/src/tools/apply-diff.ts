import { ensureFileDirectoryExists, getVscodeFileMtime } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import { writeTextDocument } from "@/lib/write-text-document";
import { parseDiffAndApply } from "@getpochi/common/diff-utils";
import {
  isVirtualPath,
  validateTextFile,
  withFileStateCacheGuard,
} from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import * as vscode from "vscode";

const logger = getLogger("applyDiffTool");

export const applyDiff: ToolFunctionType<ClientTools["applyDiff"]> = async (
  { path, searchContent, replaceContent, expectedReplacements },
  options,
) => {
  const { abortSignal, cwd } = options;

  return withFileStateCacheGuard({
    cache: options.fileStateCache,
    path,
    cwd,
    getMtime: getVscodeFileMtime,
    operation: "editing",
    doWork: async (resolvedPath) => {
      const isVirtual = isVirtualPath(resolvedPath);
      const fileUri = isVirtual
        ? vscode.Uri.parse(resolvedPath)
        : vscode.Uri.file(resolvedPath);
      if (!isVirtual) {
        await ensureFileDirectoryExists(fileUri);
      }

      const fileBuffer = await vscode.workspace.fs.readFile(fileUri);
      validateTextFile(fileBuffer);

      const fileContent = new TextDecoder().decode(fileBuffer);

      const updatedContent = await parseDiffAndApply(
        fileContent,
        searchContent,
        replaceContent,
        expectedReplacements,
      );

      const edits = await writeTextDocument(
        path,
        updatedContent,
        cwd,
        abortSignal,
      );
      logger.info(`Successfully applied diff to ${path}`);

      return {
        result: { success: true as const, ...edits },
        fileCacheContent: updatedContent,
      };
    },
  });
};
