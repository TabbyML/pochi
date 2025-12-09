import type {
  LanguageModelV2,
  LanguageModelV2Middleware,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { safeParseJSON } from "@ai-sdk/provider-utils";
import { attemptCompletionSchema } from "@getpochi/tools";
import { InvalidToolInputError, generateObject } from "ai";
import z from "zod/v4";

export function createOutputSchemaMiddleware(
  taskId: string,
  model: LanguageModelV2,
  outputSchema: z.ZodAny,
): LanguageModelV2Middleware {
  return {
    middlewareVersion: "v2",
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();

      let toolCallId = "";
      const transformedStream = stream.pipeThrough(
        new TransformStream<
          LanguageModelV2StreamPart,
          LanguageModelV2StreamPart
        >({
          async transform(chunk, controller) {
            if (
              chunk.type === "tool-input-start" &&
              chunk.toolName === "attemptCompletion"
            ) {
              toolCallId = chunk.id;
              return;
            }

            if (chunk.type === "tool-input-delta" && chunk.id === toolCallId) {
              return;
            }

            if (
              chunk.type === "tool-call" &&
              chunk.toolName === "attemptCompletion" &&
              (chunk.toolCallId === toolCallId || toolCallId === "")
            ) {
              const parsedResult = await safeParseJSON({
                text: chunk.input,
                schema: attemptCompletionSchema,
              });

              if (!parsedResult.success) {
                throw new InvalidToolInputError({
                  toolName: chunk.toolName,
                  toolInput: chunk.input,
                  cause: parsedResult.error,
                });
              }

              const { result } = parsedResult.value;

              const newInput = {
                ...parsedResult.value,
                result: await ensureOutputSchema(
                  taskId,
                  model,
                  outputSchema,
                  result,
                ),
              };

              controller.enqueue({
                ...chunk,
                input: JSON.stringify(newInput),
              });
              toolCallId = "";
              return;
            }

            controller.enqueue(chunk);
          },
        }),
      );

      return {
        stream: transformedStream,
        ...rest,
      };
    },
  };
}

async function ensureOutputSchema(
  taskId: string,
  model: LanguageModelV2,
  schema: z.ZodAny,
  content: string,
) {
  try {
    const { object } = await generateObject({
      providerOptions: {
        pochi: {
          taskId,
          version: globalThis.POCHI_CLIENT,
          useCase: "output-schema",
        },
      },
      model,
      schema,
      prompt: [
        "The model is trying to generate an object that conforms to the following schema:",
        JSON.stringify(z.toJSONSchema(schema)),
        "The current input is:",
        content,
        "Please correct the input to match the schema. Ensure that all information from the original input is preserved in the corrected output.",
      ].join("\n"),
      maxRetries: 0,
    });
    return JSON.stringify(object, null, 2);
  } catch (err) {
    return content;
  }
}
