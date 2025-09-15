import {
  APICallError,
  type LanguageModelV2,
  type LanguageModelV2StreamPart,
  getErrorMessage,
} from "@ai-sdk/provider";
import { getLogger } from "@getpochi/common";
import {
  type CreateModelOptions,
  registerModel,
} from "@getpochi/common/vendor/edge";
import type {
  VSCodeLmRequestCallback,
  VSCodeLmRequestOptions,
} from "@getpochi/common/vscode-webui-bridge";
import { ThreadAbortSignal } from "@quilted/threads";

const logger = getLogger("VscodeLM");

type ChatFn = (
  options: Omit<VSCodeLmRequestOptions, "model">,
  onChunk: VSCodeLmRequestCallback,
) => Promise<void>;

function createVSCodeLmModel({ getCredentials }: CreateModelOptions) {
  const getChatFn = getCredentials as () => Promise<ChatFn>;
  return {
    specificationVersion: "v2",
    provider: "vscode",
    modelId: "<default>",
    // FIXME(zhuquan): add supported URLs by model capabilities
    supportedUrls: {},
    doGenerate: async () => Promise.reject("Not implemented"),
    doStream: async ({ prompt, abortSignal, stopSequences }) => {
      const textId = "txt-0";
      const chatFn = await getChatFn();
      let error: unknown = undefined;
      const stream = new ReadableStream<LanguageModelV2StreamPart>({
        async start(controller) {
          controller.enqueue({
            type: "text-start",
            id: textId,
          });
          chatFn(
            {
              prompt: prompt,
              stopSequences,
              abortSignal: abortSignal
                ? ThreadAbortSignal.serialize(abortSignal)
                : undefined,
            },
            async (chunk) => {
              if (chunk.type === "error") {
                error = chunk.error;
                return;
              }
              controller.enqueue({
                id: textId,
                type: "text-delta",
                delta: chunk.text,
              });
            },
          )
            .catch((err) => {
              logger.debug("Error in stream:", err);
              error = err;
            })
            .finally(() => {
              if (error) {
                controller.enqueue({
                  type: "error",
                  error: new APICallError({
                    message: getErrorMessage(error),
                    isRetryable: false,
                    url: "",
                    requestBodyValues: null,
                  }),
                });
              } else {
                controller.enqueue({
                  type: "text-end",
                  id: textId,
                });
              }
              controller.enqueue({
                type: "finish",
                usage: {
                  inputTokens: undefined,
                  outputTokens: undefined,
                  totalTokens: undefined,
                },
                finishReason: error ? "error" : "stop",
              });
              controller.close();
            });
        },
      });

      return { stream };
    },
  } satisfies LanguageModelV2;
}

registerModel("vscode-lm", createVSCodeLmModel);
