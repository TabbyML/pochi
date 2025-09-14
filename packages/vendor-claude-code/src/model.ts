import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { wrapLanguageModel } from "ai";
import type { ClaudeCodeCredentials } from "./types";

export function createClaudeCodeModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  // Create a custom fetch function that injects the OAuth token
  const customFetch = createPatchedFetch(
    getCredentials as () => Promise<ClaudeCodeCredentials>,
  );

  // Create Anthropic client with custom fetch
  const anthropic = createAnthropic({
    baseURL: "https://api.anthropic.com/v1",
    apiKey: "oauth-token",
    fetch: customFetch as typeof fetch,
  });

  const model = anthropic(modelId);

  return wrapLanguageModel({
    model,
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        params.prompt = [
          {
            role: "system",
            // must add for Claude code Max auth
            content:
              "You are Claude Code, Anthropic's official CLI for Claude.",
          },
          ...params.prompt,
        ];
        return {
          ...params,
          maxOutputTokens: 8192,
        };
      },
    },
  });
}

function createPatchedFetch(
  getCredentials: () => Promise<ClaudeCodeCredentials>,
) {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const credentials = await getCredentials();
    const headers = new Headers(init?.headers);

    headers.set("authorization", `Bearer ${credentials.accessToken}`);
    headers.set(
      "anthropic-beta",
      "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
    );
    headers.set("anthropic-version", "2023-06-01");

    headers.delete("x-api-key");

    const patchedInit = {
      ...init,
      headers,
    };

    return fetch(input, patchedInit);
  };
}
