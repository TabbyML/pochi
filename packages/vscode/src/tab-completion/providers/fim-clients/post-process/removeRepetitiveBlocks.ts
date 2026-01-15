import { getLogger } from "@/lib/logger";
import * as levenshtein from "fast-levenshtein";
import type { TabCompletionContext } from "../../../context";
import { isBlank } from "../../../utils";
import type { BaseSegments, ExtraSegments } from "../types";
import type { PostprocessFilter } from "./types";

const logger = getLogger("TabCompletion.Providers.FIM.PostProcess");

function getBlockSplitter(_: string) {
  // Have not implemented this for each language for now
  // Return a blank line matcher should work for most cases
  return /\n(\s*)\n/g;
}

export const removeRepetitiveBlocks: PostprocessFilter = (
  item: string,
  _context: TabCompletionContext,
  baseSegments: BaseSegments,
  _extraSegments?: ExtraSegments | undefined,
): string | undefined => {
  const inputBlocks = item.split(getBlockSplitter(baseSegments.language));
  let repetitionCount = 0;
  const repetitionThreshold = 2;
  // skip last block, it maybe cut
  let index = inputBlocks.length - 2;
  while (index >= 1) {
    if (isBlank(inputBlocks[index])) {
      index--;
      continue;
    }
    let prev = index - 1;
    while (prev >= 0 && isBlank(inputBlocks[prev])) {
      prev--;
    }
    if (prev < 0) break;
    // if distance between current and previous block is less than threshold (threshold = or 10% of string length)
    const currentBlock = inputBlocks[index].trim();
    const previousBlock = inputBlocks[prev].trim();
    const threshold = Math.max(
      0.1 * currentBlock.length,
      0.1 * previousBlock.length,
    );
    const distance = levenshtein.get(currentBlock, previousBlock);
    if (distance <= threshold) {
      repetitionCount++;
      index--;
    } else {
      break;
    }
  }
  if (repetitionCount >= repetitionThreshold) {
    logger.trace("Remove repetitive blocks.", {
      inputBlocks,
      repetitionCount,
    });
    return inputBlocks
      .slice(0, index + 1)
      .join("")
      .trimEnd();
  }
  return item;
};
