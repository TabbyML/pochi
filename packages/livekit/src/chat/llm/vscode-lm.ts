import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { Store } from "@livestore/livestore";
import {
  type ThreadSignalSerialization,
  threadSignal,
} from "@quilted/threads/signals";
import type { RequestData } from "../../types";
import type { LLMRequest } from "./types";

export function createVSCodeModel(
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
      let response: ThreadSignalSerialization<{
        text: string;
        finished: boolean;
      }>;
      try {
        response = await llm.vscodeLmRequestApi({
          messages: prompt,
          model: {
            vendor: llm.vendor,
            family: llm.family,
            id: llm.id,
            version: llm.version,
          },
        });
      } catch (error) {
        console.log("VSCode LM request error", error);
      }

      const stream = new ReadableStream({
        async start(controller) {
          try {
            const signal = threadSignal(response);
            signal.subscribe((chunk) => {
              console.log("chunk", chunk);
              // Process each chunk of the response
              if (chunk.finished) {
                controller.close();
              } else {
                controller.enqueue(chunk.text);
              }
            });
          } catch (error) {
            controller.error(error);
          }
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
