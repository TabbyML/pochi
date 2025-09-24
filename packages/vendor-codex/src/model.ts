import * as crypto from "node:crypto";
import { createOpenAI } from "@ai-sdk/openai";
import { wrapLanguageModel } from "ai";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { extractAccountId } from "./auth";
import { transformToCodexFormat } from "./transformers";
import type { CodexCredentials } from "./types";

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
  const customFetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    const { accessToken } =
      await (getCredentials() as Promise<CodexCredentials>);

    // Transform the request body to codex format
    let transformedBody: string;
    if (init?.body && typeof init.body === "string") {
      try {
        const originalRequest = JSON.parse(init.body);
        const codexRequest = transformToCodexFormat(originalRequest);
        transformedBody = JSON.stringify(codexRequest);
      } catch (error) {
        transformedBody = init.body;
      }
    } else {
      transformedBody = (init?.body as string) || "";
    }

    // Add required headers for vendor-codex
    const headers = new Headers(init?.headers);
    headers.set("OpenAI-Beta", "responses=experimental");
    headers.set("session_id", crypto.randomUUID());
    headers.set("originator", "codex_cli_rs");
    headers.set("Content-Type", "application/json");

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);

      const accountId = extractAccountId(accessToken);
      if (accountId) {
        headers.set("chatgpt-account-id", accountId);
      }
    }

    return globalThis.fetch(url, {
      ...init,
      headers,
      body: transformedBody,
    });
  };

  const openai = createOpenAI({
    baseURL: "https://chatgpt.com/backend-api/codex",
    apiKey: "placeholder", // The actual token is set in the fetch function
    fetch: customFetch as typeof fetch,
  });

  return openai.responses(modelId || "gpt-5");
}
