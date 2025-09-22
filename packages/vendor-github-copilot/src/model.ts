import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { APICallError, wrapLanguageModel } from "ai";
import type { GithubCopilotCredentials } from "./types";

// const COPILOT_CHAT_URL = "https://api.githubcopilot.com";
const COPILOT_CHAT_URL = "https://api.individual.githubcopilot.com";

export function createCopilotModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  const copilotModel = createOpenAICompatible({
    name: "OpenAI",
    baseURL: COPILOT_CHAT_URL,
    fetch: createPatchedFetch(
      getCredentials as () => Promise<GithubCopilotCredentials>,
    ),
  })(modelId);

  return wrapLanguageModel({
    model: copilotModel,
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        return {
          ...params,
          max_tokens: 8192,
        };
      },
    },
  });
}

function createPatchedFetch(
  getCredentials: () => Promise<GithubCopilotCredentials>,
) {
  return async (
    requestInfo: Request | URL | string,
    requestInit?: RequestInit,
  ) => {
    const { accessToken } = await getCredentials();
    const headers = new Headers(requestInit?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Editor-Version", "vscode/1.99.3");
    headers.set("Copilot-Integration-Id", "vscode-chat");

    const resp = await fetch(requestInfo, {
      ...requestInit,
      headers,
    });
    if (!resp.body) {
      throw new APICallError({
        message: `Failed to fetch: ${resp.status} ${resp.statusText}`,
        statusCode: resp.status,
        url:
          typeof requestInfo === "string"
            ? requestInfo
            : requestInfo.toString(),
        requestBodyValues: null,
      });
    }

    return resp;
  };
}
