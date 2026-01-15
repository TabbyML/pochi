import type { TabCompletionContext } from "../../../context";
import type { BaseSegments, ExtraSegments } from "../types";
import type { PostprocessFilter } from "./types";

const MinCompletionChars = 4;

export const dropMinimum: PostprocessFilter = (
  item: string,
  _context: TabCompletionContext,
  _baseSegments: BaseSegments,
  _extraSegments?: ExtraSegments | undefined,
): string | undefined => {
  if (item.trim().length < MinCompletionChars) {
    return undefined;
  }
  return item;
};
