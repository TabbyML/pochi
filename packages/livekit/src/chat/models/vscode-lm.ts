import type {
  LanguageModelV2,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import type { RequestData } from "../../types";

export function createVSCodeLmModel(
  llm: Extract<RequestData["llm"], { type: "vscode" }>,
) {
  return {
    specificationVersion: "v2",
    provider: "vscode",
    modelId: llm.modelId || "<default>",
    // FIXME(zhuquan): add supported URLs by model capabilities
    supportedUrls: {},
    doGenerate: async () => Promise.reject("Not implemented"),
    doStream: async ({ prompt, abortSignal, stopSequences }) => {
      const textId = "txt-0";
      const stream = new ReadableStream<LanguageModelV2StreamPart>({
        async start(controller) {
          controller.enqueue({
            type: "text-start",
            id: textId,
          });
          llm
            .chatVSCodeLm(
              {
                prompt: prompt,
                model: {
                  vendor: llm.vendor,
                  family: llm.family,
                  id: llm.id,
                  version: llm.version,
                },
                stopSequences,
                abortSignal,
              },
              async (chunk) => {
                controller.enqueue({
                  id: textId,
                  type: "text-delta",
                  delta: chunk,
                });
              },
            )
            .then(() => {
              controller.enqueue({
                type: "text-end",
                id: textId,
              });
              controller.enqueue({
                type: "finish",
                usage: {
                  inputTokens: undefined,
                  outputTokens: undefined,
                  totalTokens: undefined,
                },
                finishReason: "stop",
              });
              controller.close();
            });
        },
      });

      return { stream };
    },
  } satisfies LanguageModelV2;
}
