import type {
  LanguageModelV2,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import type { Store } from "@livestore/livestore";
import type { RequestData } from "../../types";
import type { LLMRequest } from "./types";

export function createVSCodeLmModel(
  _store: Store | undefined,
  llm: Extract<RequestData["llm"], { type: "vscode" }>,
  _payload: LLMRequest,
) {
  const model: LanguageModelV2 = {
    specificationVersion: "v2",
    provider: "VSCode",
    modelId: llm.modelId || "<default>",
    // FIXME(zhuquan): add supported URLs by model capabilities
    supportedUrls: {},
    doGenerate: async () => Promise.reject("Not implemented"),
    doStream: async ({ prompt }) => {
      const stream = new ReadableStream<LanguageModelV2StreamPart>({
        async start(controller) {
          controller.enqueue({
            type: "text-start",
            id: "0",
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
              },
              async (chunk) => {
                controller.enqueue({
                  id: "0",
                  type: "text-delta",
                  delta: chunk,
                });
              },
            )
            .finally(() => {
              controller.enqueue({
                type: "text-end",
                id: "0",
              });
              controller.close();
            });
        },
      });

      return { stream };
    },
  };

  return {
    model,
    onFinish: undefined,
  };
}
