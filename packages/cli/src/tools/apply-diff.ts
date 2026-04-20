import { parseDiffAndApply } from "@getpochi/common/diff-utils";
import {
  getFileModificationTime,
  validateTextFile,
  withFileStateCacheGuard,
} from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const applyDiff =
  ({
    fileSystem,
    fileStateCache,
  }: ToolCallOptions): ToolFunctionType<ClientTools["applyDiff"]> =>
  async (
    { path, searchContent, replaceContent, expectedReplacements },
    { cwd },
  ) => {
    return withFileStateCacheGuard({
      cache: fileStateCache,
      path,
      cwd,
      getMtime: getFileModificationTime,
      operation: "editing",
      doWork: async () => {
        const fileBuffer = await fileSystem.readFile(path);
        validateTextFile(fileBuffer);
        const fileContent = new TextDecoder().decode(fileBuffer);

        const updatedContent = await parseDiffAndApply(
          fileContent,
          searchContent,
          replaceContent,
          expectedReplacements,
        );

        await fileSystem.writeFile(path, updatedContent);

        return {
          result: { success: true as const },
          fileCacheContent: updatedContent,
        };
      },
    });
  };
