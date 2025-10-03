import { listFiles as listFilesImpl } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

/**
 * Lists files and directories within the specified path
 */
export const listFiles: ToolFunctionType<ClientTools["listFiles"]> = async (
  { path: dirPath, recursive },
  { abortSignal, cwd },
) => {
  return await listFilesImpl({
    cwd,
    path: dirPath,
    recursive,
    abortSignal,
  });
};
