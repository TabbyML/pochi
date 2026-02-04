import { z } from "zod/v4";
import { NoOtherToolsReminderPrompt } from "./constants";
import { defineClientTool } from "./types";

const defaultResultSchema = z
  .string()
  .describe(
    "The result of the task. Formulate this result in a way that is final and does not require further input from the user.",
  );

export const attemptCompletionSchema = z.object({
  result: defaultResultSchema,
});

const toolDef = {
  description:
    `Once you've received the results of tool uses and can confirm that the task is complete, use this tool to present the result of your work to the user.

You MUST NOT generate any text before this tool call. All conclusion text must be included within the result parameter of the attemptCompletion tool.
Never use this tool with a question or request to engage in further conversation! Formulate the end of your result in a way that is final and does not require further input from the user.

${NoOtherToolsReminderPrompt}
`.trim(),
  inputSchema: attemptCompletionSchema,
  outputSchema: z.object({
    success: z
      .boolean()
      .describe("Indicates whether the completion was successful."),
  }),
};

export const attemptCompletion = defineClientTool(toolDef);

export const createAttemptCompletionTool = (schema?: z.ZodAny) => {
  if (!schema) {
    return defineClientTool(toolDef);
  }

  // Preprocess to handle cases where the model returns a JSON string instead of an object
  const preprocessedSchema = z.preprocess((val) => {
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    }
    return val;
  }, schema);

  return defineClientTool({
    ...toolDef,
    // Always wrap in result - use custom schema if provided, otherwise use default string result
    inputSchema: z.object({ result: preprocessedSchema }),
  });
};
