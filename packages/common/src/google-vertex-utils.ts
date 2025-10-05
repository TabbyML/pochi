import { createVertexWithoutCredentials } from "@ai-sdk/google-vertex/edge";
import type { GoogleVertexModel } from "./configuration";

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

export function createVertexModel(vertex: GoogleVertexModel, modelId: string) {
  const getBaseURL = (location: string, projectId: string) =>
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google`;

  if ("accessToken" in vertex) {
    const { location, projectId, accessToken } = vertex;
    return createVertexWithoutCredentials({
      project: projectId,
      location,
      baseURL: getBaseURL(location, projectId),
      fetch: createPatchedFetchForFinetune(accessToken),
    })(modelId);
  }

  if ("issueUrl" in vertex) {
    const { issueUrl, modelUrl } = vertex;
    return createVertexWithoutCredentials({
      project: "placeholder",
      location: "placeholder",
      baseURL: "placeholder",
      fetch: async (
        input: Request | URL | string,
        requestInit?: RequestInit,
      ) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const lastSegment = url.split("/").at(-1);
        const resp = (await fetch(issueUrl, {
          headers: {
            "Metadata-Flavor": "Google",
          },
        }).then((x) => x.json())) as {
          access_token: string;
        };
        const headers = new Headers(requestInit?.headers);
        headers.append("Authorization", `Bearer ${resp.access_token}`);
        return fetch(`${modelUrl}/${lastSegment}`, { ...requestInit, headers });
      },
    })(modelId);
  }

  return undefined as never;
}
