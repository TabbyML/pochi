import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
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
    fetch: createFetcher(
      modelId,
      getCredentials as () => Promise<GeminiCredentials>,
      // Turn on cors if in browser env
      "window" in globalThis,
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
          providerOptions: {
            google: {
              thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: 4096,
              },
            } satisfies GoogleGenerativeAIProviderOptions,
          },
        };
      },
    },
  });
}

function createFetcher(
  model: string,
  getCredentials: () => Promise<GeminiCredentials>,
  cors?: boolean,
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

    const originalUrl = new URL(
      "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse",
    );

    let urlToFetch: URL;

    if (cors) {
      const url = new URL(originalUrl);
      url.protocol = "http:";
      url.host = "localhost";
      url.port = globalThis.POCHI_CORS_PROXY_PORT;
      urlToFetch = url;
      headers.set("x-proxy-origin", originalUrl.toString());
    } else {
      urlToFetch = originalUrl;
    }

    const patchedRequestInit = {
      ...requestInit,
      headers,
      body: JSON.stringify({
        model,
        request,
        project,
      }),
    };

    const resp = await fetch(urlToFetch, patchedRequestInit);
    if (!resp.ok || !resp.body) {
      throw new APICallError({
        message: `Failed to fetch: ${resp.status} ${resp.statusText}`,
        statusCode: resp.status,
        url: urlToFetch.toString(),
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
