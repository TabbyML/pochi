import type { TabCompletionContext } from "../../../context";
import type { BaseSegments, ExtraSegments } from "../types";

export type PostprocessFilter = (
  text: string,
  context: TabCompletionContext,
  baseSegments: BaseSegments,
  extraSegments?: ExtraSegments | undefined,
) => string | undefined | Promise<string | undefined>;
