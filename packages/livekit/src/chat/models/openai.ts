import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { getLogger } from "@getpochi/common";
import { wrapLanguageModel } from "ai";
import { z } from "zod/v4";
import type { RequestData } from "../../types";

const logger = getLogger("openai");

// Zod schema for validating OpenAI API request parameters
const OpenAIRequestParamsSchema = z
  .object({
    max_tokens: z.number().positive().optional(),
    max_completion_tokens: z.number().positive().optional(),
  })
  .catchall(z.any());

export function createOpenAIModel(
  llm: Extract<RequestData["llm"], { type: "openai" }>,
) {
  const openai = createOpenAICompatible({
    name: "OpenAI",
    baseURL: llm.baseURL,
    apiKey: llm.apiKey,
    fetch: patchedFetch(llm.baseURL),
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

function isOpenAIBaseURL(baseURL: string): boolean {
  return baseURL.includes("openai.com");
}

function patchedFetch(baseURL: string) {
  const shouldOverrideMaxOutputToken = isOpenAIBaseURL(baseURL);

  if (!shouldOverrideMaxOutputToken) {
    return fetch;
  }

  return async (input: Request | URL | string, init?: RequestInit) => {
    const originalBody = init?.body as string | undefined;

    let confirmedInit = init;
    if (originalBody && typeof originalBody === "string") {
      const patched = overrideMaxOutputToken(originalBody);
      if (patched) {
        confirmedInit = { ...init, body: patched };
      }
    }
    const firstResponse = await fetch(input, confirmedInit);
    return firstResponse;
  };
}

// helper function to access & edit the raw parameter initialisation
function overrideMaxOutputToken(body: string): string | undefined {
  try {
    const json = JSON.parse(body);

    // Safely validate the JSON structure with Zod
    const result = OpenAIRequestParamsSchema.safeParse(json);

    if (!result.success) {
      // Log validation errors for debugging but don't crash
      logger.error("OpenAI request body validation failed:", result.error);
      return undefined;
    }

    const parsed = result.data;

    // Apply the transformation safely
    if (parsed.max_tokens) {
      parsed.max_completion_tokens = parsed.max_tokens;
    }

    return JSON.stringify(parsed);
  } catch (error) {
    // Log the error for debugging but don't crash
    logger.error("Failed to parse OpenAI request body:", error);
    // ignore if body is not JSON
  }
  return undefined;
}
