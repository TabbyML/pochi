import type { PochiAdvanceSettings } from "@/integrations/configuration";
import type { CompletionContextSegments } from "../contexts";
import type { CompletionResultItem } from "../solution";

export interface CodeCompletionClientProvider {
  fetchCompletion(params: {
    segments: CompletionContextSegments;
    temperature?: number | undefined;
    abortSignal?: AbortSignal | undefined;
  }): Promise<CompletionResultItem>;
}

export type ProviderConfig = NonNullable<
  NonNullable<PochiAdvanceSettings["inlineCompletion"]>["provider"]
>;
