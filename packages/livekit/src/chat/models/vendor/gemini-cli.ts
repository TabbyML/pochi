import { createVertexWithoutCredentials } from "@ai-sdk/google-vertex/edge";
import type { GeminiCliVendorConfig } from "@getpochi/common/configuration";
import { APICallError, wrapLanguageModel } from "ai";

export function createGeminiCliModel(
  getCredentials: () => Promise<unknown>,
  modelId: string,
) {
  const vertexModel = createVertexWithoutCredentials({
    project: "default",
    location: "global",
    baseURL: "https://cloudcode-pa.googleapis.com",
    fetch: createPatchedFetch(modelId, getCredentials),
  })(modelId);

  return wrapLanguageModel({
    model: vertexModel,
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        return {
          ...params,
          maxOutputTokens: 32768,
        };
      },
    },
  });
}

function createPatchedFetch(
  model: string,
  getCredentials: () => Promise<unknown>,
) {
  return async (
    _requestInfo: Request | URL | string,
    requestInit?: RequestInit,
  ) => {
    const { accessToken, project } =
      (await getCredentials()) as GeminiCliVendorConfig["credentials"];
    const headers = new Headers(requestInit?.headers);
    if (accessToken) {
      headers.append("Authorization", `Bearer ${accessToken}`);
    }
    const request = JSON.parse((requestInit?.body as string) || "null");
    const patchedRequestInit = {
      ...requestInit,
      headers,
      body: JSON.stringify({
        model,
        request,
        project,
      }),
    };

    const resp = await fetch(
      "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
      patchedRequestInit,
    );
    if (!resp.body) {
      throw new APICallError({
        message: `Failed to fetch: ${resp.status} ${resp.statusText}`,
        statusCode: resp.status,
        url: "",
        requestBodyValues: null,
      });
    }
    const body = resp.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(
        new TransformStream({
          async transform(chunk, controller) {
            if (chunk.startsWith("data: ")) {
              const data = JSON.parse(chunk.slice(6));
              const newChunk = `data: ${JSON.stringify(data.response)}\n\n`;
              controller.enqueue(newChunk);
            } else {
              controller.enqueue(chunk);
            }
          },
        }),
      )
      .pipeThrough(new TextEncoderStream());

    return new Response(body, resp);
  };
}
