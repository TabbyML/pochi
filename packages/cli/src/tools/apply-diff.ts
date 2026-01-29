import { parseDiffAndApply } from "@getpochi/common/diff-utils";
import { validateTextFile } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const applyDiff =
  ({
    fileSystem,
  }: ToolCallOptions): ToolFunctionType<ClientTools["applyDiff"]> =>
  async ({ path, searchContent, replaceContent, expectedReplacements }) => {
    const fileBuffer = await fileSystem.readFile(path);
    validateTextFile(fileBuffer);
    const fileContent = fileBuffer.toString();

    const updatedContent = await parseDiffAndApply(
      fileContent,
      searchContent,
      replaceContent,
      expectedReplacements,
    );

    await fileSystem.writeFile(path, updatedContent);
    return { success: true };
  };
