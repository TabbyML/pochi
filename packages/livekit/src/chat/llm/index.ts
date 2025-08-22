import type { LLMFormatterOptions } from "@getpochi/common";
import type { Store } from "@livestore/livestore";
import type { RequestData } from "../../types";
import { createGoogleVertexTuningModel } from "./google-vertex-tuning";
import { createOpenAIModel } from "./openai";
import { createPochiModel } from "./pochi";
import { request } from "./request";
import type { LLMRequest } from "./types";
import { createVSCodeLmModel } from "./vscode-lm";

export interface RequestLLMOptions {
  store?: Store;
  llm: RequestData["llm"];
  payload: LLMRequest;
  formatterOptions?: LLMFormatterOptions;
}

export function requestLLM(options: RequestLLMOptions) {
  const { store, llm, payload, formatterOptions } = options;
  const { model, onFinish } = createModel(store, llm, payload);
  return request(model, payload, formatterOptions, onFinish);
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

  if (llm.type === "vscode") {
    return createVSCodeLmModel(llm);
  }

  if (llm.type === "pochi") {
    return createPochiModel(store, llm, payload);
  }

  throw new Error(`Unknown LLM type: ${llm}`);
}
