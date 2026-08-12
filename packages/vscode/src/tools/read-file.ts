import { TerminalHistoryManager } from "@/integrations/terminal/terminal-history";
import { getVscodeFileMtime } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import { parseBackgroundJobOutputFilePath } from "@getpochi/common/pochi-file-system";
import {
  FileUnchangedStub,
  isPlainText,
  isVirtualPath,
  readMediaFile,
  resolveReadFileRange,
  selectFileContent,
  withReadFileCache,
} from "@getpochi/common/tool-utils";

import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { InferToolOutput } from "ai";
import * as vscode from "vscode";

const logger = getLogger("readFile");

type ReadFileOutput = InferToolOutput<ClientTools["readFile"]>;

export const readFile: ToolFunctionType<ClientTools["readFile"]> = async (
  { path, startLine, endLine, offset, limit },
  options,
) => {
  const range = resolveReadFileRange({
    startLine,
    endLine,
    offset,
    limit,
  });
  startLine = range.startLine;
  endLine = range.endLine;
  const { cwd, contentType } = options;

  const isBinaryRequest = !!(contentType && contentType.length > 0);

  logger.debug(
    `readFile: path="${path}" startLine=${startLine} endLine=${endLine} fileStateCache=${options.fileStateCache ? "present" : "MISSING"}`,
  );

  assertTerminalTranscriptAvailable(path);

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

      return {
        result,
        fileCacheContent: result.content,
        fileCacheIsTruncated: result.isTruncated,
      };
    },
  });

  if (cacheResult.deduplicated) {
    logger.debug(`readFile: returning FileUnchangedStub for "${path}"`);
    return addTerminalMetadata(path, {
      content: FileUnchangedStub,
      isTruncated: false,
    });
  }

  logger.debug(`readFile: returning fresh content for "${path}"`);
  return addTerminalMetadata(path, cacheResult.result);
};

function assertTerminalTranscriptAvailable(path: string): void {
  const outputFile = parseBackgroundJobOutputFilePath(path);
  if (outputFile?.kind !== "terminal") return;

  const history = TerminalHistoryManager.get(outputFile.backgroundJobId);
  if (!history?.hasCapturedCommand) {
    throw new Error("No terminal output is available to read.");
  }
}

function addTerminalMetadata(
  path: string,
  result: ReadFileOutput,
): ReadFileOutput {
  if (result.type === "media") return result;

  const outputFile = parseBackgroundJobOutputFilePath(path);
  if (outputFile?.kind !== "terminal") return result;

  const history = TerminalHistoryManager.get(outputFile.backgroundJobId);
  if (!history) return result;

  return {
    ...result,
    _meta: {
      terminalName: history.terminalName,
      lastCommand: history.lastCommand,
    },
  };
}
