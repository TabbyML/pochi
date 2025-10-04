import {
  createVertex,
  createVertexWithoutCredentials,
} from "@ai-sdk/google-vertex/edge";
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

  if ("serviceAccountKey" in vertex) {
    const service_account_key = JSON.parse(vertex.serviceAccountKey);
    const location = vertex.location;
    const project = service_account_key.project_id;
    return createVertex({
      project,
      location,
      baseURL: getBaseURL(location, project),
      googleCredentials: {
        clientEmail: service_account_key.client_email,
        privateKeyId: service_account_key.private_key_id,
        privateKey: service_account_key.private_key,
      },
      fetch: createPatchedFetchForFinetune(),
    })(modelId);
  }

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
