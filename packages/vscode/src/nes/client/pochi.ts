import { createVertexWithoutCredentials } from "@ai-sdk/google-vertex/edge";
import { getVendor } from "@getpochi/common/vendor";
import type { PochiCredentials } from "@getpochi/common/vscode-webui-bridge";

const ModelId = "654670113898758144";

export function createPochiModel() {
  const vertexModel = createVertexWithoutCredentials({
    baseURL:
      "http://api-gateway.getpochi.com/https/us-central1-aiplatform.googleapis.com/v1/projects/gen-lang-client-0005535210/locations/us-central1/publishers/google",
    fetch: async (
      requestInfo: Request | URL | string,
      requestInit?: RequestInit,
    ) => {
      const { jwt } = (await getVendor(
        "pochi",
      ).getCredentials()) as PochiCredentials;
      const headers = new Headers(requestInit?.headers);
      headers.append("Authorization", `Bearer ${jwt}`);
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
        throw new Error(`Unexpected requestInfo type: ${typeof requestInfo}`);
      }
      return fetch(finalUrl, patchedRequestInit);
    },
  })(ModelId);
  return vertexModel;
}

function patchString(str: string) {
  return str.replace("/publishers/google/models", "/endpoints");
}
