import type {
  JSONSchema7,
  LanguageModelV3,
  LanguageModelV3Middleware,
  LanguageModelV3StreamPart,
} from "@ai-sdk/provider";
import { jsonSchema, safeParseJSON } from "@ai-sdk/provider-utils";
import type { PochiProviderOptions } from "@getpochi/common";
import { attemptCompletionSchema } from "@getpochi/tools";
import { InvalidToolInputError, Output, generateText } from "ai";
import z from "zod";
import { sanitizeSchemaForStructuredOutput } from "../llm/sanitize-schema";

export function createOutputSchemaMiddleware(
  taskId: string,
  model: LanguageModelV3,
  outputSchema: z.ZodAny,
): LanguageModelV3Middleware {
  return {
    specificationVersion: "v3",
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();

      let toolCallId = "";
      const transformedStream = stream.pipeThrough(
        new TransformStream<
          LanguageModelV3StreamPart,
          LanguageModelV3StreamPart
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
  model: LanguageModelV3,
  schema: z.ZodAny,
  content: string,
) {
  try {
    const rawJsonSchema = z.toJSONSchema(schema);
    const sanitizedSchema = jsonSchema(
      sanitizeSchemaForStructuredOutput(
        rawJsonSchema as unknown as JSONSchema7,
      ),
    );
    const { output: object } = await generateText({
      providerOptions: {
        pochi: {
          taskId,
          client: globalThis.POCHI_CLIENT,
          useCase: "output-schema",
        } satisfies PochiProviderOptions,
        anthropic: {
          thinking: { type: "disabled" },
        },
      },
      model,
      output: Output.object({ schema: sanitizedSchema }),
      prompt: [
        "The model is trying to generate an object that conforms to the following schema:",
        JSON.stringify(rawJsonSchema),
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
