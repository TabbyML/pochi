import {
  createVertex,
  createVertexWithoutCredentials,
} from "@ai-sdk/google-vertex/edge";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createGoogleVertexTuningModel(
  llm: Extract<RequestData["llm"], { type: "google-vertex-tuning" }>,
) {
  const location = llm.location;
  const credentials = llm.credentials ? JSON.parse(llm.credentials) : undefined;
  const projectId = llm.projectId || credentials?.project_id;
  const accessToken = llm.accessToken;
  const baseURL = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google`;

  const vertexFineTuning = accessToken
    ? createVertexWithoutCredentials({
        project: projectId,
        location,
        baseURL,
        fetch: createPatchedFetchForFinetune(accessToken),
      })
    : createVertex({
        project: projectId,
        location,
        baseURL,
        googleCredentials: {
          clientEmail: credentials.client_email,
          privateKeyId: credentials.private_key_id,
          privateKey: credentials.private_key,
        },
        fetch: createPatchedFetchForFinetune(),
      });
  return wrapLanguageModel({
    model: vertexFineTuning(llm.modelId),
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.maxOutputTokens;
        return params;
      },
    },
  });
}

function createPatchedFetchForFinetune(accessToken?: string | undefined) {
  function patchString(str: string) {
    return str.replace("/publishers/google/models", "/endpoints");
  }

  return (requestInfo: Request | URL | string, requestInit?: RequestInit) => {
    const headers = new Headers(requestInit?.headers);
    if (accessToken) {
      headers.append("Authorization", `Bearer ${accessToken}`);
    }
    const patchedRequestInit = {
      ...requestInit,
      headers,
    };

    if (requestInfo instanceof URL) {
      const patchedUrl = new URL(requestInfo);
      patchedUrl.pathname = patchString(patchedUrl.pathname);
      return fetch(patchedUrl, patchedRequestInit);
    }
    if (requestInfo instanceof Request) {
      const patchedUrl = patchString(requestInfo.url);
      const patchedRequest = new Request(patchedUrl, requestInfo);
      return fetch(patchedRequest, patchedRequestInit);
    }
    if (typeof requestInfo === "string") {
      const patchedUrl = patchString(requestInfo);
      return fetch(patchedUrl, patchedRequestInit);
    }
    // Should never happen
    throw new Error(`Unexpected requestInfo type: ${typeof requestInfo}`);
  };
}
