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
  outputSchema: z.ZodAny,
): LanguageModelV2Middleware {
  return {
    middlewareVersion: "v2",
    wrapStream: async ({ doStream, model }) => {
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
                result: await ensureOutputSchema(model, outputSchema, result),
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
  model: LanguageModelV2,
  schema: z.ZodAny,
  content: string,
) {
  try {
    const { object } = await generateObject({
      model,
      schema,
      prompt: [
        "The model is trying to generate object with following schema:",
        JSON.stringify(z.toJSONSchema(schema)),
        "Current input is",
        content,
        "Please fix the inputs.",
      ].join("\n"),
      maxRetries: 0,
    });
    return JSON.stringify(object);
  } catch (err) {
    return content;
  }
}
