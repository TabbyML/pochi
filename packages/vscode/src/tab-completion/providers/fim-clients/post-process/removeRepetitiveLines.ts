import { getLogger } from "@/lib/logger";
import * as levenshtein from "fast-levenshtein";
import type { TabCompletionContext } from "../../../context";
import { isBlank, splitLines } from "../../../utils";
import type { BaseSegments, ExtraSegments } from "../types";
import type { PostprocessFilter } from "./types";

const logger = getLogger("TabCompletion.Providers.FIM.PostProcess");

export const removeRepetitiveLines: PostprocessFilter = (
  item: string,
  _context: TabCompletionContext,
  _baseSegments: BaseSegments,
  _extraSegments?: ExtraSegments | undefined,
): string | undefined => {
  const inputLines = splitLines(item);
  let repetitionCount = 0;
  const repetitionThreshold = 5;
  // skip last line, it could be a not completed line
  let index = inputLines.length - 2;
  while (index >= 1) {
    if (isBlank(inputLines[index])) {
      index--;
      continue;
    }
    let prev = index - 1;
    while (prev >= 0 && isBlank(inputLines[prev])) {
      prev--;
    }
    if (prev < 0) break;
    // if distance between current and previous line is less than threshold (threshold = or 10% of string length)
    const currentLine = inputLines[index].trim();
    const previousLine = inputLines[prev].trim();
    const threshold = Math.max(
      0.1 * currentLine.length,
      0.1 * previousLine.length,
    );
    const distance = levenshtein.get(currentLine, previousLine);
    if (distance <= threshold) {
      repetitionCount++;
      index = prev;
    } else {
      break;
    }
  }
  if (repetitionCount >= repetitionThreshold) {
    logger.trace("Remove repetitive lines.", {
      inputLines,
      repetitionCount,
    });
    return inputLines
      .slice(0, index + 1)
      .join("")
      .trimEnd();
  }
  return item;
};
