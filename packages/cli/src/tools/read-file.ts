import {
  FileUnchangedStub,
  getFileModificationTime,
  isPlainText,
  readMediaFile,
  selectFileContent,
  withReadFileCache,
} from "@getpochi/common/tool-utils";

import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { InferToolOutput } from "ai";
import type { ToolCallOptions } from "../types";

type ReadFileOutput = InferToolOutput<ClientTools["readFile"]>;

export const readFile =
  ({
    fileSystem,
    fileStateCache,
  }: ToolCallOptions): ToolFunctionType<ClientTools["readFile"]> =>
  async ({ path, startLine, endLine }, { cwd, contentType }) => {
    const isBinaryRequest = !!(contentType && contentType.length > 0);

    const cacheResult = await withReadFileCache<ReadFileOutput>({
      cache: fileStateCache,
      path,
      cwd,
      startLine,
      endLine,
      getMtime: getFileModificationTime,
      doRead: async (resolvedPath) => {
        const fileBuffer = await fileSystem.readFile(path);
        const isPlainTextFile = isPlainText(fileBuffer);

        if (isBinaryRequest && !isPlainTextFile) {
          return {
            result: readMediaFile(resolvedPath, fileBuffer, contentType),
            fileCacheContent: null,
          };
        }

        if (!isPlainTextFile) {
          throw new Error("Reading binary files is not supported.");
        }

        const fileContent = new TextDecoder().decode(fileBuffer);
        const addLineNumbers = !!process.env.VSCODE_TEST_OPTIONS;

        const result = selectFileContent(fileContent, {
          startLine,
          endLine,
          addLineNumbers,
        });

        return {
          result,
          fileCacheContent: result.content,
          fileCacheIsTruncated: result.isTruncated,
        };
      },
    });

    if (cacheResult.deduplicated) {
      return { content: FileUnchangedStub, isTruncated: false };
    }

    return cacheResult.result;
  };
