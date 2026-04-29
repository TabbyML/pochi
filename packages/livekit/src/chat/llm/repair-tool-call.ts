import type { LanguageModelV3 } from "@ai-sdk/provider";
import { jsonSchema } from "@ai-sdk/provider-utils";
import type { PochiProviderOptions } from "@getpochi/common";
import {
  NoSuchToolError,
  Output,
  type Tool,
  type ToolCallRepairFunction,
  generateText,
} from "ai";
import { sanitizeSchemaForStructuredOutput } from "./sanitize-schema";

export const makeRepairToolCall: (
  taskId: string,
  model: LanguageModelV3,
) => ToolCallRepairFunction<Record<string, Tool>> =
  (taskId, model) =>
  async ({ toolCall, inputSchema, error }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null; // do not attempt to fix invalid tool names
    }

    const rawSchema = await inputSchema({ toolName: toolCall.toolName });
    const toolSchema = jsonSchema(sanitizeSchemaForStructuredOutput(rawSchema));

    const { output: repairedArgs } = await generateText({
      providerOptions: {
        pochi: {
          taskId,
          client: globalThis.POCHI_CLIENT,
          useCase: "repair-tool-call",
        } satisfies PochiProviderOptions,
        anthropic: {
          thinking: { type: "disabled" },
        },
      },
      model,
      output: Output.object({
        schema: toolSchema,
      }),
      prompt: [
        `The model tried to call the tool "${toolCall.toolName}" with the following inputs:`,
        JSON.stringify(toolCall.input),
        "The tool accepts the following schema:",
        JSON.stringify(rawSchema),
        "Please fix the inputs.",
      ].join("\n"),
    });

    return { ...toolCall, input: JSON.stringify(repairedArgs) };
  };
