import { getLogger } from "@/lib/logger";
import type { TabCompletionContext } from "../../../context";
import { isBlank, splitLines } from "../../../utils";
import type { BaseSegments, ExtraSegments } from "../types";
import type { PostprocessFilter } from "./types";

const logger = getLogger("TabCompletion.Providers.FIM.PostProcess");

const repetitionTests = [
  /(.{3,}?)\1{5,}$/g, // match a 3+ characters pattern repeating 5+ times
  /(.{10,}?)\1{3,}$/g, // match a 10+ characters pattern repeating 3+ times
];

export const removeLineEndsWithRepetition: PostprocessFilter = (
  item: string,
  _context: TabCompletionContext,
  _baseSegments: BaseSegments,
  _extraSegments?: ExtraSegments | undefined,
): string | undefined => {
  // only test last non-blank line
  const inputLines = splitLines(item);
  let index = inputLines.length - 1;
  while (index >= 0 && isBlank(inputLines[index])) {
    index--;
  }
  if (index < 0) {
    return item;
  }
  // if matches repetition test, remove this line
  for (const test of repetitionTests) {
    const match = inputLines[index].match(test);
    if (match) {
      logger.trace("Remove line ends with repetition.", {
        inputLines,
        lineNumber: index,
        match,
      });
      if (index < 1) {
        return undefined;
      }
      return inputLines.slice(0, index).join("").trimEnd();
    }
  }
  // no repetition found
  return item;
};
