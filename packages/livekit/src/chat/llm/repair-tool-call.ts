import type { LanguageModelV2 } from "@ai-sdk/provider";
import {
  NoSuchToolError,
  type Tool,
  type ToolCallRepairFunction,
  streamText,
} from "ai";

export const makeRepairToolCall: (
  model: LanguageModelV2,
) => ToolCallRepairFunction<Record<string, Tool>> =
  (model) =>
  async ({ toolCall, inputSchema, error }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null; // do not attempt to fix invalid tool names
    }

    const result = await streamText({
      model,
      prompt: [
        `The model tried to call the tool "${toolCall.toolName}" with the following arguments:`,
        JSON.stringify(toolCall.input),
        "The tool accepts the following schema:",
        JSON.stringify(inputSchema(toolCall)),
        "Please fix the arguments. Please ONLY output the json string, without any other text (no markdown code block wrapper, either)",
        "",
        "<good-example>",
        '{"path": "./src/file.ts", "content": "console.log("hello");"}',
        "</good-example>",
        "",
        "<bad-example>",
        "```json",
        '{"path": "./src/file.ts", "content": "console.log("hello");"}',
        "```",
        "</bad-example>",
        "",
        "<bad-example>",
        "Here is the corrected JSON:",
        '{"path": "./src/file.ts", "content": "console.log("hello");"}',
        "</bad-example>",
        "",
        "<bad-example>",
        "```",
        '{"path": "./src/file.ts", "content": "console.log("hello");"}',
        "```",
        "</bad-example>",
        "",
        "<bad-example>",
        '{"path": "./src/file.ts", "content": "console.log("hello");"} // Fixed arguments',
        "</bad-example>",
      ].join("\n"),
      maxOutputTokens: 3_000,
      maxRetries: 0,
    });

    return { ...toolCall, input: await result.text };
  };
