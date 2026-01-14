import type { TabCompletionContext } from "../../../context";
import type { BaseSegments, ExtraSegments } from "../types";
import { dropDuplicated } from "./dropDuplicated";
import { dropMinimum } from "./dropMinimum";
import { formatIndentation } from "./formatIndentation";
import { limitScopeByIndentation } from "./limitScopeByIndentation";
import { normalizeIndentation } from "./normalizeIndentation";
import { removeDuplicateSuffixLines } from "./removeDuplicateSuffixLines";
import { removeDuplicatedBlockClosingLine } from "./removeDuplicatedBlockClosingLine";
import { removeLineEndsWithRepetition } from "./removeLineEndsWithRepetition";
import { removeRepetitiveBlocks } from "./removeRepetitiveBlocks";
import { removeRepetitiveLines } from "./removeRepetitiveLines";
import { trimMultiLineInSingleLineMode } from "./trimMultiLineInSingleLineMode";
import { trimSpace } from "./trimSpace";
import type { PostprocessFilter } from "./types";

const Filters: PostprocessFilter[] = [
  trimMultiLineInSingleLineMode,
  removeRepetitiveBlocks,
  removeRepetitiveLines,
  removeLineEndsWithRepetition,
  limitScopeByIndentation,
  removeDuplicatedBlockClosingLine,
  formatIndentation,
  normalizeIndentation,
  dropDuplicated,
  trimSpace,
  removeDuplicateSuffixLines,
  dropMinimum,
];

export async function postprocess(
  text: string,
  context: TabCompletionContext,
  baseSegments: BaseSegments,
  extraSegments?: ExtraSegments | undefined,
): Promise<string | undefined> {
  let processed: string | undefined = text;
  for (const filter of Filters) {
    processed = await filter(processed, context, baseSegments, extraSegments);
    if (processed === undefined) {
      break;
    }
  }
  return processed;
}
