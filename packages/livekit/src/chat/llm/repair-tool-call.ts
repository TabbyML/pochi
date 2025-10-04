import type { LanguageModelV2 } from "@ai-sdk/provider";
import { PochiTaskIdHeader } from "@getpochi/common/pochi-api";
import { createClientTools } from "@getpochi/tools";
import {
  NoSuchToolError,
  type Tool,
  type ToolCallRepairFunction,
  generateObject,
} from "ai";

export const makeRepairToolCall: (
  taskId: string,
  model: LanguageModelV2,
) => ToolCallRepairFunction<Record<string, Tool>> =
  (taskId, model) =>
  async ({ toolCall, inputSchema, error }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null; // do not attempt to fix invalid tool names
    }

    const tools = createClientTools();
    const tool = tools[toolCall.toolName as keyof typeof tools];

    const { object: repairedArgs } = await generateObject({
      headers: {
        [PochiTaskIdHeader]: taskId,
      },
      model,
      schema: tool.inputSchema,
      prompt: [
        `The model tried to call the tool "${toolCall.toolName}" with the following inputs:`,
        JSON.stringify(toolCall.input),
        "The tool accepts the following schema:",
        JSON.stringify(inputSchema(toolCall)),
        "Please fix the inputs.",
      ].join("\n"),
    });

    return { ...toolCall, input: JSON.stringify(repairedArgs) };
  };
