import {
  FileUnchangedStub,
  getFileModificationTime,
  isPlainText,
  parseBackgroundCommandOutputFilePath,
  prependBackgroundCommandRunningHint,
  readMediaFile,
  resolveReadFileRange,
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
    adaptor,
  }: ToolCallOptions): ToolFunctionType<ClientTools["readFile"]> =>
  async ({ path, startLine, endLine, offset, limit }, { cwd, contentType }) => {
    const range = resolveReadFileRange({
      startLine,
      endLine,
      offset,
      limit,
    });
    startLine = range.startLine;
    endLine = range.endLine;
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
          result: { ...result, filePath: resolvedPath },
          fileCacheContent: result.content,
          fileCacheIsTruncated: result.isTruncated,
        };
      },
    });

    if (cacheResult.deduplicated) {
      return addRunningCommandHint(path, adaptor, {
        content: FileUnchangedStub,
        isTruncated: false,
        filePath: cacheResult.resolvedPath,
      });
    }

    return addRunningCommandHint(path, adaptor, cacheResult.result);
  };

/**
 * Reports liveness for a managed background command transcript. The job
 * registry is the only status source; file content, size, or cache behavior
 * never imply whether the process is still running.
 */
function addRunningCommandHint(
  path: string,
  adaptor: ToolCallOptions["adaptor"] | undefined,
  result: ReadFileOutput,
): ReadFileOutput {
  if (result.type === "media") return result;

  const backgroundJobId = parseBackgroundCommandOutputFilePath(path);
  if (!backgroundJobId) return result;
  if (!adaptor?.isBackgroundCommandRunning(backgroundJobId)) return result;

  return {
    ...result,
    content: prependBackgroundCommandRunningHint(result.content),
  };
}
