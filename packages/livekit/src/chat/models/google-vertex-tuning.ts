import { createVertex } from "@ai-sdk/google-vertex/edge";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createGoogleVertexTuningModel(
  llm: Extract<RequestData["llm"], { type: "google-vertex-tuning" }>,
) {
  const credentials = JSON.parse(llm.credentials);

  const vertexFineTuning = createVertex({
    project: credentials.project_id,
    location: "us-central1",
    baseURL: `https://aiplatform.googleapis.com/v1/projects/${credentials.project_id}/locations/${llm.location}/publishers/google`,
    googleCredentials: {
      clientEmail: credentials.client_email,
      privateKeyId: credentials.private_key_id,
      privateKey: credentials.private_key,
    },
    fetch: patchedFetchForFinetune as unknown as typeof globalThis.fetch,
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

function patchedFetchForFinetune(
  requestInfo: Request | URL | string,
  requestInit?: RequestInit,
): Promise<Response> {
  function patchString(str: string) {
    return str.replace("/publishers/google/models", "/endpoints");
  }

  if (requestInfo instanceof URL) {
    const patchedUrl = new URL(requestInfo);
    patchedUrl.pathname = patchString(patchedUrl.pathname);
    return fetch(patchedUrl, requestInit);
  }
  if (requestInfo instanceof Request) {
    const patchedUrl = patchString(requestInfo.url);
    const patchedRequest = new Request(patchedUrl, requestInfo);
    return fetch(patchedRequest, requestInit);
  }
  if (typeof requestInfo === "string") {
    const patchedUrl = patchString(requestInfo);
    return fetch(patchedUrl, requestInit);
  }
  // Should never happen
  throw new Error(`Unexpected requestInfo type: ${typeof requestInfo}`);
}
