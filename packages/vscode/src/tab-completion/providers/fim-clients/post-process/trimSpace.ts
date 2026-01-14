import type { TabCompletionContext } from "../../../context";
import { isBlank } from "../../../utils";
import type { BaseSegments, ExtraSegments } from "../types";
import type { PostprocessFilter } from "./types";

export const trimSpace: PostprocessFilter = (
  item: string,
  _context: TabCompletionContext,
  baseSegments: BaseSegments,
  _extraSegments?: ExtraSegments | undefined,
): string | undefined => {
  const { currentLinePrefix, currentLineSuffix } = baseSegments;
  let trimmedInput = item;

  if (!isBlank(currentLinePrefix) && currentLinePrefix.match(/\s$/)) {
    trimmedInput = trimmedInput.trimStart();
  }
  if (
    isBlank(currentLineSuffix) ||
    (!isBlank(currentLineSuffix) && currentLineSuffix.match(/^\s/))
  ) {
    trimmedInput = trimmedInput.trimEnd();
  }
  return trimmedInput;
};
