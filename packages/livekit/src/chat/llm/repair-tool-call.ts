import type { LanguageModelV3 } from "@ai-sdk/provider";
import { jsonSchema } from "@ai-sdk/provider-utils";
import type { PochiProviderOptions } from "@getpochi/common";
import {
  NoSuchToolError,
  Output,
  type Tool,
  type ToolCallRepairFunction,
  extractJsonMiddleware,
  generateText,
  wrapLanguageModel,
} from "ai";

const RepairSystemPrompt = [
  "You are a JSON repair assistant.",
  "Respond with ONLY a JSON object that matches the provided schema.",
  "Do not include prose, explanations, comments, markdown, or code fences.",
].join(" ");

export const makeRepairToolCall: (
  taskId: string,
  model: LanguageModelV3,
) => ToolCallRepairFunction<Record<string, Tool>> =
  (taskId, model) =>
  async ({ toolCall, inputSchema, error }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null; // do not attempt to fix invalid tool names
    }

    const schema = await inputSchema({ toolName: toolCall.toolName });
    const toolSchema = jsonSchema(schema);

    // Wrap the model so that markdown code fences (```json ... ```) emitted by
    // the repair model are stripped before JSON parsing. Without this, even a
    // well-formed payload wrapped in fences fails with
    // `Unexpected token '\`'` and the conversation gets stuck on retries.
    const repairModel = wrapLanguageModel({
      model,
      middleware: [extractJsonMiddleware()],
    });

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
      model: repairModel,
      output: Output.object({
        schema: toolSchema,
      }),
      system: RepairSystemPrompt,
      prompt: [
        `The model tried to call the tool "${toolCall.toolName}" with the following raw arguments:`,
        // `toolCall.input` is already a stringified JSON payload (per
        // LanguageModelV3ToolCall). Passing it through as-is avoids the
        // double-stringification (`"\"…\""`) that previously confused the
        // model.
        toolCall.input,
        "The tool accepts the following JSON schema:",
        JSON.stringify(schema),
        `Parse error: ${error.message}`,
        "Return the corrected arguments as a single JSON object matching the schema.",
      ].join("\n"),
    });

    return { ...toolCall, input: JSON.stringify(repairedArgs) };
  };
