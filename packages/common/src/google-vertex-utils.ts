import {
  createVertex,
  createVertexWithoutCredentials,
} from "@ai-sdk/google-vertex/edge";
import type { GoogleVertexModel } from "./configuration";

// Declare global variable for CORS proxy url prefix
declare global {
  var POCHI_CORS_PROXY_URL_PREFIX: string;
}

function createPatchedFetchForFinetune(accessToken?: string | undefined) {
  function patchString(str: string) {
    const matches = str.match(/models\/([^:]+)/);
    const modelId = matches ? matches[1] : undefined;
    if (modelId && isEndpointModelId(modelId)) {
      return str.replace("/publishers/google/models", "/endpoints");
    }
    return str;
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

    let finalUrl: URL;
    if (requestInfo instanceof URL) {
      finalUrl = new URL(requestInfo);
      finalUrl.pathname = patchString(finalUrl.pathname);
    } else if (requestInfo instanceof Request) {
      const patchedUrl = patchString(requestInfo.url);
      finalUrl = new URL(patchedUrl);
    } else if (typeof requestInfo === "string") {
      const patchedUrl = patchString(requestInfo);
      finalUrl = new URL(patchedUrl);
    } else {
      // Should never happen
      throw new Error(`Unexpected requestInfo type: ${typeof requestInfo}`);
    }

    // Use CORS proxy if configured
    if (globalThis.POCHI_CORS_PROXY_URL_PREFIX) {
      const proxyUrl = finalUrl.toString();
      finalUrl = new URL(
        globalThis.POCHI_CORS_PROXY_URL_PREFIX + encodeURIComponent(proxyUrl),
      );
    }

    return fetch(finalUrl, patchedRequestInit);
  };
}

export function createVertexModel(vertex: GoogleVertexModel, modelId: string) {
  const getBaseURL = (location: string, projectId: string) =>
    `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google`;

  if (vertex.type === "service-account") {
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

  if (vertex.type === "access-token") {
    const { location, projectId, accessToken } = vertex;
    return createVertexWithoutCredentials({
      project: projectId,
      location,
      baseURL: getBaseURL(location, projectId),
      fetch: createPatchedFetchForFinetune(accessToken),
    })(modelId);
  }

  if (vertex.type === "model-url") {
    const { issueUrl, modelUrl, timeout } = vertex;
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

        let accessToken: string;
        try {
          const resp = await fetch(issueUrl, {
            headers: {
              "Metadata-Flavor": "Google",
            },
          });
          if (resp.headers.get("content-type") === "application/json") {
            const { access_token } = (await resp.json()) as {
              access_token: string;
            };
            accessToken = access_token;
          } else {
            accessToken = await resp.text();
          }
        } catch (err) {
          return new Response("Failed to fetch token", { status: 401 });
        }

        const headers = new Headers(requestInit?.headers);
        headers.append("Authorization", `Bearer ${accessToken}`);
        return fetch(`${modelUrl}/${lastSegment}`, {
          ...requestInit,
          headers,
          signal: AbortSignal.timeout(timeout),
        });
      },
    })(modelId);
  }

  return undefined as never;
}

function isEndpointModelId(modelId: string): boolean {
  // endpoint model is all numberic
  return /^\d+$/.test(modelId);
}
