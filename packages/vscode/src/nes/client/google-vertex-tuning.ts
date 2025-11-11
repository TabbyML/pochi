import { createVertexModel } from "@getpochi/common/google-vertex-utils";
import type { ProviderConfig } from "./type";

export type GoogleVertexTuningProviderConfig = Extract<
  ProviderConfig,
  { type: "google-vertex-tuning" }
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
