import { createVertexWithoutCredentials } from "@ai-sdk/google-vertex/edge";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { EventSourceParserStream } from "@ai-sdk/provider-utils";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { APICallError, wrapLanguageModel } from "ai";
import type { GeminiCredentials } from "./types";

export function createGeminiCliModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  const vertexModel = createVertexWithoutCredentials({
    project: "default",
    location: "global",
    baseURL: "https://cloudcode-pa.googleapis.com",
    fetch: createPatchedFetch(
      modelId,
      getCredentials as () => Promise<GeminiCredentials>,
    ),
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
  getCredentials: () => Promise<GeminiCredentials>,
) {
  return async (
    _requestInfo: Request | URL | string,
    requestInit?: RequestInit,
  ) => {
    const { accessToken, project } = await getCredentials();
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
    if (!resp.ok || !resp.body) {
      throw new APICallError({
        message: `Failed to fetch: ${resp.status} ${resp.statusText}`,
        statusCode: resp.status,
        url: "",
        requestBodyValues: null,
      });
    }
    const body = resp.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream())
      .pipeThrough(
        new TransformStream({
          async transform({ data }, controller) {
            const item = JSON.parse(data);
            const newChunk = `data: ${JSON.stringify(item.response)}\r\n\r\n`;
            controller.enqueue(newChunk);
          },
        }),
      )
      .pipeThrough(new TextEncoderStream());

    return new Response(body, resp);
  };
}
