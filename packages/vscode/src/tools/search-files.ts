import { vscodeRipgrepPath } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import { searchFilesWithRipgrep } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

const logger = getLogger("searchFiles");

export const searchFiles: ToolFunctionType<ClientTools["searchFiles"]> = async (
  { path, regex, filePattern },
  { abortSignal, cwd },
) => {
  logger.debug(
    "handling searchFiles with path",
    path,
    "and regex",
    regex,
    "and filePattern",
    filePattern,
  );
  return await searchFilesWithRipgrep(
    path,
    regex,
    vscodeRipgrepPath,
    cwd,
    filePattern,
    abortSignal,
  );
};
