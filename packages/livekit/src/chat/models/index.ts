import type { RequestData } from "../../types";
import { createAiGatewayModel } from "./ai-gateway";
import { createAnthropicModel } from "./anthropic";
import { createGoogleVertexTuningModel } from "./google-vertex-tuning";
import { createOpenAIModel } from "./openai";
import { createOpenAIResponsesModel } from "./openai-responses";

export function createModel({ llm }: { llm: RequestData["llm"] }) {
  if (llm.type === "vendor") {
    return llm.getModel();
  }

  if (llm.type === "openai") {
    return createOpenAIModel(llm);
  }

  if (llm.type === "anthropic") {
    return createAnthropicModel(llm);
  }

  if (llm.type === "google-vertex-tuning") {
    return createGoogleVertexTuningModel(llm);
  }

  if (llm.type === "ai-gateway") {
    return createAiGatewayModel(llm);
  }

  if (llm.type === "openai-responses") {
    return createOpenAIResponsesModel(llm);
  }

  assertUnreachable(llm);
}

function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}
