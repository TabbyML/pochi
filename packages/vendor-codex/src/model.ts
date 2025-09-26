import { createOpenAI } from "@ai-sdk/openai";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { wrapLanguageModel } from "ai";
import { transformToCodexFormat } from "./transformers";
import type { CodexCredentials } from "./types";
import { extractAccountId } from "./utils";

/**
 * Create headers for Codex API requests
 */
function createCodexHeaders(
  credentials: CodexCredentials,
  init?: RequestInit,
): Headers {
  const headers = new Headers(init?.headers);
  headers.set("OpenAI-Beta", "responses=experimental");
  headers.set("originator", "codex_cli_rs");
  headers.set("Content-Type", "application/json");
  if (credentials.accessToken) {
    headers.set("Authorization", `Bearer ${credentials.accessToken}`);
    const accountId = extractAccountId(credentials.accessToken);
    if (accountId) {
      headers.set("chatgpt-account-id", accountId);
    }
  }
  return headers;
}

/**
 * Transform request body for Codex API
 */
function transformRequestBody(body: string | undefined): string {
  if (!body) return "";

  try {
    const originalRequest = JSON.parse(body);
    const codexRequest = transformToCodexFormat(originalRequest);
    return JSON.stringify(codexRequest);
  } catch (error) {
    return body;
  }
}

/**
 * Create a fetch function with Codex-specific transformations
 */
function createCodexFetch(getCredentials: () => Promise<unknown>) {
  return async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const credentials = await (getCredentials() as Promise<CodexCredentials>);

    const transformedBody = transformRequestBody(
      typeof init?.body === "string" ? init.body : undefined,
    );

    const headers = createCodexHeaders(credentials, init);

    return fetch(url, {
      ...init,
      headers,
      body: transformedBody || undefined,
    });
  };
}

export function createCodexModel({
  modelId,
  getCredentials,
}: CreateModelOptions) {
  return wrapLanguageModel({
    model: createCodexResponsesModel(modelId, getCredentials),
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        return params;
      },
    },
  });
}

function createCodexResponsesModel(
  modelId: string | undefined,
  getCredentials: () => Promise<unknown>,
) {
  const customFetch = createCodexFetch(getCredentials);

  const openai = createOpenAI({
    baseURL: "https://chatgpt.com/backend-api/codex",
    apiKey: "placeholder",
    fetch: customFetch as typeof fetch,
  });

  return openai.responses(modelId || "gpt-5");
}

function createProxyFetch(getCredentials: () => Promise<unknown>) {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const originalUrl = new URL(input.toString());
    const apiOrigin = originalUrl.origin;

    const url = new URL(originalUrl);
    url.protocol = "http:";
    url.host = "localhost";
    url.port = globalThis.POCHI_CORS_PROXY_PORT;

    const transformedBody = transformRequestBody(
      typeof init?.body === "string" ? init.body : undefined,
    );

    const credentials = await (getCredentials() as Promise<CodexCredentials>);
    const headers = createCodexHeaders(credentials, init);

    headers.set("x-proxy-origin", apiOrigin);

    return fetch(url, {
      ...init,
      headers,
      body: transformedBody || undefined,
    });
  };
}

export function createEdgeCodexModel({
  modelId,
  getCredentials,
}: CreateModelOptions) {
  const customFetch = createProxyFetch(getCredentials);
  return wrapLanguageModel({
    model: createOpenAI({
      baseURL: "https://chatgpt.com/backend-api/codex",
      apiKey: "placeholder",
      fetch: customFetch as typeof fetch,
    }).responses(modelId || "gpt-5"),
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        return params;
      },
    },
  });
}
