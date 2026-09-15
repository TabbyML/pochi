import type { RequestData } from "../../types";
import { createAiGatewayModel } from "./ai-gateway";
import { createAnthropicModel } from "./anthropic";
import { createGoogleVertexTuningModel } from "./google-vertex-tuning";
import { createMiniMaxModel } from "./minimax";
import { createOpenAIModel } from "./openai";
import { createOpenAIResponsesModel } from "./openai-responses";

export function createModel({
  llm,
  taskId,
}: {
  llm: RequestData["llm"];
  /**
   * The task id for this request. Passed to the BYOK (bring-your-own-key)
   * OpenAI-compatible provider so it can send it as the `x-pochi-session-id`
   * header on outgoing LLM requests.
   */
  taskId: string;
}) {
  if (llm.type === "vendor") {
    return llm.getModel();
  }

  if (llm.type === "openai") {
    return createOpenAIModel(llm, taskId);
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

  if (llm.type === "minimax") {
    return createMiniMaxModel(llm);
  }

  assertUnreachable(llm);
}

function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}
