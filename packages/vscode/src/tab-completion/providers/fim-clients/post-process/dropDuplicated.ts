import { getLogger } from "@/lib/logger";
import * as levenshtein from "fast-levenshtein";
import type { TabCompletionContext } from "../../../context";
import { isBlank, splitLines } from "../../../utils";
import type { BaseSegments, ExtraSegments } from "../types";
import type { PostprocessFilter } from "./types";

const logger = getLogger("TabCompletion.Providers.FIM.PostProcess");

export const dropDuplicated: PostprocessFilter = (
  item: string,
  _context: TabCompletionContext,
  baseSegments: BaseSegments,
  _extraSegments?: ExtraSegments | undefined,
): string | undefined => {
  // get first n (n <= 3) lines of input and suffix, ignore blank lines
  const suffixLines = baseSegments.suffixLines;
  const inputLines = splitLines(item);
  let inputIndex = 0;
  while (inputIndex < inputLines.length && isBlank(inputLines[inputIndex])) {
    inputIndex++;
  }
  let suffixIndex = 0;
  while (
    suffixIndex < suffixLines.length &&
    isBlank(suffixLines[suffixIndex])
  ) {
    suffixIndex++;
  }
  const lineCount = Math.min(
    3,
    inputLines.length - inputIndex,
    suffixLines.length - suffixIndex,
  );
  if (lineCount < 1) {
    return item;
  }
  const inputToCompare = inputLines
    .slice(inputIndex, inputIndex + lineCount)
    .join("")
    .trim();
  const suffixToCompare = suffixLines
    .slice(suffixIndex, suffixIndex + lineCount)
    .join("")
    .trim();
  // if string distance is less than threshold (threshold = 1, or 5% of string length)
  // drop this completion due to duplicated
  const threshold = Math.max(
    1,
    0.05 * inputToCompare.length,
    0.05 * suffixToCompare.length,
  );
  const distance = levenshtein.get(inputToCompare, suffixToCompare);
  if (distance <= threshold) {
    logger.trace("Drop completion due to duplicated.", {
      inputToCompare,
      suffixToCompare,
      distance,
      threshold,
    });
    return undefined;
  }
  return item;
};
