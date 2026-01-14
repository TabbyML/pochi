import type { TabCompletionNESProviderSettings } from "@/integrations/configuration";
import type { TabCompletionProviderClient } from "../types";
import { NESChatModelClient } from "./chat-model-client";
import { createGoogleVertexTuningModel } from "./models/google-vertex-tuning";
import { createPochiModel } from "./models/pochi";

export function createNESProviderClient(
  id: string,
  config: TabCompletionNESProviderSettings,
): TabCompletionProviderClient<object, object> | undefined {
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
