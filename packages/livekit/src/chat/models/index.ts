import type { RequestData } from "../../types";
import { createGoogleVertexTuningModel } from "./google-vertex-tuning";
import { createOpenAIModel } from "./openai";
import { createPochiModel } from "./pochi";
import { createVSCodeLmModel } from "./vscode-lm";

export function createModel({
  id,
  llm,
}: { id?: string; llm: RequestData["llm"] }) {
  if (llm.type === "openai") {
    return createOpenAIModel(llm);
  }

  if (llm.type === "google-vertex-tuning") {
    return createGoogleVertexTuningModel(llm);
  }

  if (llm.type === "vscode") {
    return createVSCodeLmModel(llm);
  }

  if (llm.type === "pochi") {
    return createPochiModel(id, llm);
  }

  throw new Error(`Unknown LLM type: ${llm}`);
}
