import { getVscodeFileMtime } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import {
  FILE_UNCHANGED_STUB,
  isPlainText,
  isVirtualPath,
  readMediaFile,
  selectFileContent,
  withReadFileCache,
} from "@getpochi/common/tool-utils";

import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { InferToolOutput } from "ai";
import * as vscode from "vscode";

const logger = getLogger("readFile");

type ReadFileOutput = InferToolOutput<ClientTools["readFile"]>;

export const readFile: ToolFunctionType<ClientTools["readFile"]> = async (
  { path, startLine, endLine },
  options,
) => {
  const { cwd, contentType } = options;

  const isBinaryRequest = !!(contentType && contentType.length > 0);

  logger.debug(
    `readFile: path="${path}" startLine=${startLine} endLine=${endLine} fileStateCache=${options.fileStateCache ? "present" : "MISSING"}`,
  );

  const cacheResult = await withReadFileCache<ReadFileOutput>({
    cache: options.fileStateCache,
    path,
    cwd,
    startLine,
    endLine,
    getMtime: getVscodeFileMtime,
    doRead: async (resolvedPath) => {
      const fileUri = isVirtualPath(resolvedPath)
        ? vscode.Uri.parse(resolvedPath)
        : vscode.Uri.file(resolvedPath);

      const fileBuffer = await vscode.workspace.fs.readFile(fileUri);
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

      return { result, fileCacheContent: fileContent };
    },
  });

  if (cacheResult.deduplicated) {
    logger.debug(`readFile: returning FILE_UNCHANGED_STUB for "${path}"`);
    return { content: FILE_UNCHANGED_STUB, isTruncated: false };
  }

  logger.debug(`readFile: returning fresh content for "${path}"`);
  return cacheResult.result;
};
