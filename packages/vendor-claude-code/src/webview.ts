import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { wrapLanguageModel } from "ai";
import type { ClaudeCodeCredentials } from "./types";

/**
 * Create Claude Code model for webview environment
 * Uses a local proxy server to bypass CORS restrictions
 */
export function createClaudeCodeWebviewModel({
  modelId,
  getCredentials,
  proxyUrl = "http://127.0.0.1:54321",
}: CreateModelOptions & { proxyUrl?: string }): LanguageModelV2 {
  // Create a custom fetch that routes through our proxy
  const customFetch = createProxyFetch(
    proxyUrl,
    getCredentials as () => Promise<ClaudeCodeCredentials>,
  );

  // Create Anthropic client pointing to proxy
  const anthropic = createAnthropic({
    baseURL: `${proxyUrl}/v1`,
    apiKey: "oauth-token", // Will be replaced by proxy
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

function createProxyFetch(
  proxyUrl: string,
  getCredentials: () => Promise<ClaudeCodeCredentials>,
) {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    // Get credentials for header injection (optional, proxy will handle if missing)
    const credentials = await getCredentials();

    // Convert relative URLs to proxy URLs
    let url: string;
    if (typeof input === "string") {
      url = input.startsWith("http") ? input : `${proxyUrl}${input}`;
    } else if (input instanceof URL) {
      url = input.toString();
      if (!url.startsWith("http")) {
        url = `${proxyUrl}${url}`;
      }
    } else {
      // Request object
      const reqUrl = (input as Request).url;
      url = reqUrl.startsWith("http") ? reqUrl : `${proxyUrl}${reqUrl}`;
    }

    const headers = new Headers(init?.headers);

    // Add auth header if we have credentials
    if (credentials) {
      headers.set("authorization", `Bearer ${credentials.accessToken}`);
    }

    // Required Anthropic headers
    headers.set(
      "anthropic-beta",
      "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
    );
    headers.set("anthropic-version", "2023-06-01");

    // Remove x-api-key as we're using OAuth
    headers.delete("x-api-key");

    return fetch(url, {
      ...init,
      headers,
    });
  };
}