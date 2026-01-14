import { getLogger } from "@/lib/logger";
import type { TabCompletionContext } from "../../../context";
import { isBlank, isBlockClosingLine, splitLines } from "../../../utils";
import type { BaseSegments, ExtraSegments } from "../types";
import type { PostprocessFilter } from "./types";

const logger = getLogger("TabCompletion.Providers.FIM.PostProcess");

export const removeDuplicatedBlockClosingLine: PostprocessFilter = (
  item: string,
  _context: TabCompletionContext,
  baseSegments: BaseSegments,
  _extraSegments?: ExtraSegments | undefined,
): string | undefined => {
  const { suffixLines, currentLinePrefix } = baseSegments;
  const inputLines = splitLines(item);
  if (inputLines.length < 2) {
    // If completion only has one line, don't continue process
    return item;
  }

  const inputLinesForDetection = inputLines.map((line, index) => {
    return index === 0 ? currentLinePrefix + line : line;
  });
  if (!isBlockClosingLine(inputLinesForDetection, inputLines.length - 1)) {
    return item;
  }
  const inputEndingLine = inputLines[inputLines.length - 1];

  let suffixBeginningIndex = 1;
  while (
    suffixBeginningIndex < suffixLines.length &&
    isBlank(suffixLines[suffixBeginningIndex])
  ) {
    suffixBeginningIndex++;
  }
  if (suffixBeginningIndex >= suffixLines.length) {
    return item;
  }
  const suffixBeginningLine = suffixLines[suffixBeginningIndex];

  if (
    inputEndingLine.startsWith(suffixBeginningLine.trimEnd()) ||
    suffixBeginningLine.startsWith(inputEndingLine.trimEnd())
  ) {
    logger.trace("Remove duplicated block closing line.", {
      inputLines,
      suffixLines,
    });
    return inputLines
      .slice(0, inputLines.length - 1)
      .join("")
      .trimEnd();
  }
  return item;
};
