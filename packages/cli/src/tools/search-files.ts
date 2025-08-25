import * as fs from "node:fs";
import { getLogger } from "@getpochi/common";
import { searchFilesWithRipgrep } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

const logger = getLogger("searchFiles");

export const searchFiles =
  (context: ToolCallOptions): ToolFunctionType<ClientTools["searchFiles"]> =>
  async ({ path, regex, filePattern }, { abortSignal }) => {
    const rgPath = context.rg;
    if (!rgPath || !fs.existsSync(rgPath)) {
      logger.error("Ripgrep not found at path", rgPath);
      throw new Error(`Ripgrep not found at path: ${rgPath}`);
    }
    return await searchFilesWithRipgrep(
      path,
      regex,
      rgPath,
      context.cwd,
      filePattern,
      abortSignal,
    );
  };
