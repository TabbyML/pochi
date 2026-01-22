import type { TabCompletionNESProviderSettings } from "@/integrations/configuration";
import { OpenAIFetcher } from "../fetchers";
import type { TabCompletionProviderClient } from "../types";
import { NESChatModelClient } from "./chat-model-client";
import { createGoogleVertexTuningModel } from "./models/google-vertex-tuning";
import { createPochiModel } from "./models/pochi";
import { NESSweepModelClient } from "./sweep-model-client";

export function createNESProviderClient(
  id: string,
  config: TabCompletionNESProviderSettings,
): TabCompletionProviderClient<object, object> | undefined {
  if (config.type === "NES:openai") {
    if (config.model.startsWith("sweep-next-edit")) {
      const fetcher = new OpenAIFetcher(config);
      return new NESSweepModelClient(id, fetcher);
    }
  }

  if (config.type === "NES:google-vertex-tuning") {
    const model = createGoogleVertexTuningModel(config);
    if (!model) {
      return undefined;
    }
    return new NESChatModelClient(id, model);
  }

  if (config.type === "NES:pochi") {
    const model = createPochiModel();
    return new NESChatModelClient(id, model);
  }

  return undefined;
}
