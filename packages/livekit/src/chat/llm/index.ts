import type { Store } from "@livestore/livestore";
import type { RequestData } from "../../types";
import { createGoogleVertexTuningModel } from "./google-vertex-tuning";
import { createOpenAIModel } from "./openai";
import { createPochiModel } from "./pochi";
import { request } from "./request";
import type { LLMRequest } from "./types";
import { createVSCodeModel } from "./vscode-lm";

export function requestLLM(
  store: Store | undefined,
  llm: RequestData["llm"],
  payload: LLMRequest,
) {
  const { model, onFinish } = createModel(store, llm, payload);
  return request(model, payload, onFinish);
}

function createModel(
  store: Store | undefined,
  llm: RequestData["llm"],
  payload: LLMRequest,
) {
  if (llm.type === "openai") {
    return createOpenAIModel(llm);
  }

  if (llm.type === "google-vertex-tuning") {
    return createGoogleVertexTuningModel(llm);
  }

  if (llm.type === "pochi") {
    return createPochiModel(store, llm, payload);
  }

  if (llm.type === "vscode") {
    return createVSCodeModel(store, llm, payload);
  }

  throw new Error(`Unknown LLM type: ${llm}`);
}
