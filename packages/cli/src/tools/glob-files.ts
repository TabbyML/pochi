import { globFiles as globFilesImpl } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

/**
 * Finds files matching a glob pattern within the specified directory
 */
export const globFiles =
  (): ToolFunctionType<ClientTools["globFiles"]> =>
  async ({ path: searchPath, globPattern }, { abortSignal, cwd }) => {
    return globFilesImpl({
      cwd: cwd,
      path: searchPath,
      globPattern,
      abortSignal,
    });
  };
