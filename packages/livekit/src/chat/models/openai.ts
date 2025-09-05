import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createOpenAIModel(
  llm: Extract<RequestData["llm"], { type: "openai" }>,
) {
  const openai = createOpenAICompatible({
    name: "OpenAI",
    baseURL: llm.baseURL,
    apiKey: llm.apiKey,
    fetch: patchedFetch(llm.modelId),
  });

  return wrapLanguageModel({
    model: openai(llm.modelId),
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.maxOutputTokens;
        return params;
      },
    },
  });
}

function isReasoningModel(modelId: string): boolean {
  return /^o\d|(^|-)mini(\b|$)/.test(modelId);
}

function patchedFetch(modelId: string) {
  const changeParam = isReasoningModel(modelId);

  return async (input: Request | URL | string, init?: RequestInit) => {
    const originalBody = init?.body as string | undefined;

    // Pre-write the params
    let firstInit = init;
    if (changeParam && originalBody && typeof originalBody === "string") {
      const patched = swapField(originalBody);
      if (patched) {
        firstInit = { ...init, body: patched };
      }
    }
    const firstResponse = await fetch(input, firstInit);
    return firstResponse;
  };
}

// helper function to access & edit the raw parameter initialisation
function swapField(body: string): string | undefined {
  try {
    const json = JSON.parse(body);
    if (json && typeof json === "object") {
      if (Object.prototype.hasOwnProperty.call(json, "max_tokens")) {
        json.max_completion_tokens = json.max_tokens;
        json.max_tokens = undefined;
      } else if (
        Object.prototype.hasOwnProperty.call(json, "max_completion_tokens")
      ) {
        json.max_tokens = json.max_completion_tokens;
        json.max_completion_tokens = undefined;
      }
      return JSON.stringify(json);
    }
  } catch {
    // ignore if body is not JSON
  }
  return undefined;
}
