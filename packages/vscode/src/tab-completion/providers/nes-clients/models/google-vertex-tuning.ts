import type { TabCompletionNESProviderSettings } from "@/integrations/configuration";
import { createVertexModel } from "@getpochi/common/google-vertex-utils";

type GoogleVertexTuningProviderConfig = Extract<
  TabCompletionNESProviderSettings,
  { type: "NES:google-vertex-tuning" }
>;

export function createGoogleVertexTuningModel(
  config: GoogleVertexTuningProviderConfig,
) {
  const model = config.model.trim();
  const vertex = config.vertex;
  if (model && vertex) {
    return createVertexModel(vertex, model);
  }

  return undefined;
}
