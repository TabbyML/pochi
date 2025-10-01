import type { PochiAdvanceSettings } from "@/integrations/configuration";
import type { NESContextSegments } from "../contexts";
import type { NESResponseItem } from "../types";

export interface NESClientProvider {
  fetchCompletion(params: {
    segments: NESContextSegments;
    abortSignal?: AbortSignal | undefined;
  }): Promise<NESResponseItem | undefined>;
}

export type ProviderConfig = NonNullable<
  NonNullable<PochiAdvanceSettings["nextEditSuggestion"]>["provider"]
>;
