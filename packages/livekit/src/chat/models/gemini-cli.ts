import { createVertexWithoutCredentials } from "@ai-sdk/google-vertex/edge";
import { type LanguageModel, wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createGeminiCliModel(
  llm: Extract<RequestData["llm"], { type: "gemini-cli" }>,
): LanguageModel {
  const accessToken = llm.accessToken;
  const projectId = llm.projectId;
  const location = llm.location;

  // Since we assume accessToken always exists, we can directly create a
  // custom fetch function that injects the Authorization header.
  const customFetch = (
    requestInfo: Request | URL | string,
    requestInit?: RequestInit,
  ) => {
    const headers = new Headers(requestInit?.headers);
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    const newRequestInit = {
      ...requestInit,
      headers,
    };
    return fetch(requestInfo, newRequestInit);
  };

  const vertex = createVertexWithoutCredentials({
    project: projectId,
    fetch: customFetch,
    location,
  });

  return wrapLanguageModel({
    model: vertex(llm.modelId),
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.maxOutputTokens;
        return params;
      },
    },
  });
}
