// Modified from: https://github.com/TabbyML/tabby/blob/493cef3b3229548175de430dbc7f7e4a092ca507/clients/tabby-agent/src/codeCompletion/postprocess

import type { CompletionContext, CompletionExtraContexts } from "../contexts";
import type { CompletionResultItem } from "../solution";
import type {
  PostprocessConfig,
  PostprocessFilter,
  PostprocessFilterFactory,
} from "./base";
import { dropDuplicated } from "./dropDuplicated";
import { dropMinimum } from "./dropMinimum";
import { formatIndentation } from "./formatIndentation";
import { limitScope } from "./limitScope";
import { normalizeIndentation } from "./normalizeIndentation";
import { removeDuplicateSuffixLines } from "./removeDuplicateSuffixLines";
import { removeDuplicatedBlockClosingLine } from "./removeDuplicatedBlockClosingLine";
import { removeLineEndsWithRepetition } from "./removeLineEndsWithRepetition";
import { removeRepetitiveBlocks } from "./removeRepetitiveBlocks";
import { removeRepetitiveLines } from "./removeRepetitiveLines";
import { trimMultiLineInSingleLineMode } from "./trimMultiLineInSingleLineMode";
import { trimSpace } from "./trimSpace";
import "../utils/array"; // for mapAsync

export interface ItemsWithContext {
  items: readonly CompletionResultItem[];
  context: CompletionContext;
  extraContext: CompletionExtraContexts;
}
type ItemsFilter = (params: ItemsWithContext) => Promise<ItemsWithContext>;

function createListFilter(
  filterFactory: PostprocessFilterFactory,
  config: PostprocessConfig,
): ItemsFilter {
  const filter: PostprocessFilter = filterFactory(config);
  return async (params: ItemsWithContext): Promise<ItemsWithContext> => {
    const processed = await params.items.mapAsync(
      async (item: CompletionResultItem) => {
        return await filter(item, params.context, params.extraContext);
      },
    );
    return {
      items: processed,
      context: params.context,
      extraContext: params.extraContext,
    };
  };
}

export async function preCacheProcess(
  items: readonly CompletionResultItem[],
  context: CompletionContext,
  extraContext: CompletionExtraContexts,
  config: PostprocessConfig,
): Promise<readonly CompletionResultItem[]> {
  const applyFilter = (
    filterFactory: PostprocessFilterFactory,
  ): ItemsFilter => {
    return createListFilter(filterFactory, config);
  };
  const result = await Promise.resolve({ items, context, extraContext })
    .then(applyFilter(trimMultiLineInSingleLineMode))
    .then(applyFilter(removeLineEndsWithRepetition))
    .then(applyFilter(dropDuplicated))
    .then(applyFilter(trimSpace))
    .then(applyFilter(dropMinimum));
  return result.items;
}

export async function postCacheProcess(
  items: readonly CompletionResultItem[],
  context: CompletionContext,
  extraContext: CompletionExtraContexts,
  config: PostprocessConfig,
): Promise<readonly CompletionResultItem[]> {
  const applyFilter = (
    filterFactory: PostprocessFilterFactory,
  ): ItemsFilter => {
    return createListFilter(filterFactory, config);
  };
  const result = await Promise.resolve({ items, context, extraContext })
    .then(applyFilter(removeRepetitiveBlocks))
    .then(applyFilter(removeRepetitiveLines))
    .then(applyFilter(limitScope))
    .then(applyFilter(removeDuplicatedBlockClosingLine))
    .then(applyFilter(formatIndentation))
    .then(applyFilter(normalizeIndentation))
    .then(applyFilter(dropDuplicated))
    .then(applyFilter(trimSpace))
    .then(applyFilter(removeDuplicateSuffixLines))
    .then(applyFilter(dropMinimum));
  return result.items;
}
