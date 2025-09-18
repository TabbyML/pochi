import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { wrapLanguageModel } from "ai";
import type { ClaudeCodeCredentials } from "./types";

const ClaudeCodeSystemPrompt =
  "You are Claude Code, Anthropic's official CLI for Claude.";

const AnthropicHeaders = {
  beta: "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
  version: "2023-06-01",
} as const;

function addAnthropicHeaders(
  headers: Headers,
  credentials?: ClaudeCodeCredentials,
): void {
  if (credentials) {
    headers.set("authorization", `Bearer ${credentials.accessToken}`);
  }
  headers.set("anthropic-beta", AnthropicHeaders.beta);
  headers.set("anthropic-version", AnthropicHeaders.version);
  headers.delete("x-api-key");
}

function createClaudeCodeModelBase(
  modelId: string,
  baseURL: string,
  customFetch: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): LanguageModelV2 {
  const anthropic = createAnthropic({
    baseURL,
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
            content: ClaudeCodeSystemPrompt,
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

    addAnthropicHeaders(headers, credentials);

    return fetch(input, { ...init, headers });
  };
}

function createProxyFetch(
  getCredentials: () => Promise<ClaudeCodeCredentials | undefined>,
  proxyUrl: string,
) {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = convertToProxyUrl(input, proxyUrl);
    const credentials = await getCredentials();
    const headers = new Headers(init?.headers);

    addAnthropicHeaders(headers, credentials);
    headers.delete("origin");
    headers.delete("referer");

    return fetch(url, { ...init, headers });
  };
}

function convertToProxyUrl(
  input: string | URL | Request,
  proxyUrl: string,
): string {
  if (typeof input === "string") {
    if (input.startsWith("https://api.anthropic.com")) {
      return input.replace("https://api.anthropic.com", proxyUrl);
    }
    if (input.startsWith("/")) {
      return `${proxyUrl}${input}`;
    }
    return input;
  }

  if (input instanceof URL) {
    return input.toString().replace("https://api.anthropic.com", proxyUrl);
  }

  return (input as Request).url.replace("https://api.anthropic.com", proxyUrl);
}

export function createClaudeCodeModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  const customFetch = createPatchedFetch(
    getCredentials as () => Promise<ClaudeCodeCredentials>,
  );

  return createClaudeCodeModelBase(
    modelId,
    "https://api.anthropic.com/v1",
    customFetch,
  );
}

export function createWebviewClaudeCodeModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  const PROXY_URL =
    process.env.CLAUDE_CODE_PROXY_URL || "http://localhost:54321";

  const customFetch = createProxyFetch(
    getCredentials as () => Promise<ClaudeCodeCredentials | undefined>,
    PROXY_URL,
  );

  return createClaudeCodeModelBase(modelId, `${PROXY_URL}/v1`, customFetch);
}
