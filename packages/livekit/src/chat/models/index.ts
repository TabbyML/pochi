import type { RequestData } from "../../types";
import { createAiGatewayModel } from "./ai-gateway";
import { createGoogleVertexTuningModel } from "./google-vertex-tuning";
import { createOpenAIModel } from "./openai";
import { createPochiModel } from "./pochi";
import { createVendorModel } from "./vendor";
import { createVSCodeLmModel } from "./vscode-lm";

export function createModel({
  id,
  llm,
}: { id: string; llm: RequestData["llm"] }) {
  if (llm.type === "openai") {
    return createOpenAIModel(llm);
  }

  if (llm.type === "google-vertex-tuning") {
    return createGoogleVertexTuningModel(llm);
  }

  if (llm.type === "vendor") {
    return createVendorModel(llm);
  }

  if (llm.type === "vscode") {
    return createVSCodeLmModel(llm);
  }

  if (llm.type === "pochi") {
    return createPochiModel(id, llm);
  }

  if (llm.type === "ai-gateway") {
    return createAiGatewayModel(llm);
  }

  throw new Error(`Unknown LLM type: ${llm}`);
}
