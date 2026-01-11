import type * as vscode from "vscode";
import type { TabCompletionContext } from "../context";
import type { TextEdit } from "../utils";

export interface TabCompletionProviderResponseItem {
  readonly edit: TextEdit;
}

export interface TabCompletionProviderClient<
  BaseSegmentsType extends NonNullable<object>,
  ExtraSegmentsType extends NonNullable<object>,
> {
  collectBaseSegments(
    context: TabCompletionContext,
  ): BaseSegmentsType | undefined;

  collectExtraSegments(
    context: TabCompletionContext,
    baseSegments: BaseSegmentsType,
    token?: vscode.CancellationToken | undefined,
  ): Promise<ExtraSegmentsType | undefined>;

  fetchCompletion(
    context: TabCompletionContext,
    baseSegments: BaseSegmentsType,
    extraSegments?: ExtraSegmentsType | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<TabCompletionProviderResponseItem | undefined>;
}
