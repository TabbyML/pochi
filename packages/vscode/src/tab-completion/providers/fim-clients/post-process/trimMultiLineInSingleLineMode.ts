import { getLogger } from "@/lib/logger";
import type { TabCompletionContext } from "../../../context";
import { splitLines } from "../../../utils";
import type { BaseSegments, ExtraSegments } from "../types";
import type { PostprocessFilter } from "./types";

const logger = getLogger("TabCompletion.Providers.FIM.PostProcess");

export const trimMultiLineInSingleLineMode: PostprocessFilter = (
  item: string,
  _context: TabCompletionContext,
  baseSegments: BaseSegments,
  _extraSegments?: ExtraSegments | undefined,
): string | undefined => {
  const inputLines = splitLines(item);
  if (!baseSegments.isLineEnd && inputLines.length > 1) {
    const suffix = baseSegments.currentLineSuffix.trimEnd();
    const inputLine = inputLines[0].trimEnd();
    if (inputLine.endsWith(suffix)) {
      const trimmedInputLine = inputLine.slice(0, -suffix.length);
      if (trimmedInputLine.length > 0) {
        logger.trace("Trim content with multiple lines.", {
          inputLines,
          trimmedInputLine,
        });
        return trimmedInputLine;
      }
    }
    logger.trace("Drop content with multiple lines.", { inputLines });
    return undefined;
  }
  return item;
};
