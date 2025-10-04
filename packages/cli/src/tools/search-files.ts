import * as fs from "node:fs";
import { searchFilesWithRipgrep } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const searchFiles =
  (context: ToolCallOptions): ToolFunctionType<ClientTools["searchFiles"]> =>
  async ({ path, regex, filePattern }, { abortSignal, cwd }) => {
    const rgPath = context.rg;
    if (!rgPath || !fs.existsSync(rgPath)) {
      // Return empty results with a helpful message when ripgrep is not available
      return {
        matches: [],
        isTruncated: false,
        error: "Search functionality requires ripgrep to be installed. Please install ripgrep to enable file searching.",
      };
    }
    return await searchFilesWithRipgrep(
      path,
      regex,
      rgPath,
      cwd,
      filePattern,
      abortSignal,
    );
  };
