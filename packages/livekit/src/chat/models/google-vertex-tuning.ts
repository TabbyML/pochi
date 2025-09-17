import { createVertexModel } from "@getpochi/common/google-vertex-utils";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createGoogleVertexTuningModel(
  llm: Extract<RequestData["llm"], { type: "google-vertex-tuning" }>,
) {
  const vertexModel = createVertexModel(llm.vertex, llm.modelId);

  return wrapLanguageModel({
    model: vertexModel,
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.maxOutputTokens;
        return params;
      },
    },
  });
}
