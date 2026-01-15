import type { TabCompletionFIMProviderSettings } from "@/integrations/configuration";
import type { TabCompletionProviderClient } from "../types";
import { FIMClient } from "./client";
import { FIMGoogleVertexTuningModel } from "./models/google-vertex-tuning";
import { FIMOpenAIModel } from "./models/openai";
import { FIMPochiModel } from "./models/pochi";

export function createFIMProviderClient(
  id: string,
  config: TabCompletionFIMProviderSettings,
): TabCompletionProviderClient<object, object> | undefined {
  if (config.type === "FIM:google-vertex-tuning") {
    const model = new FIMGoogleVertexTuningModel(id, config);
    return new FIMClient(id, model);
  }

  if (config.type === "FIM:openai") {
    const model = new FIMOpenAIModel(id, config);
    return new FIMClient(id, model);
  }

  if (config.type === "FIM:pochi") {
    const model = new FIMPochiModel(id);
    return new FIMClient(id, model);
  }

  return undefined;
}
