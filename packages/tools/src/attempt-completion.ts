import { z } from "zod";
import { NoOtherToolsReminderPrompt } from "./constants";
import { defineClientTool } from "./types";

export const attemptCompletionSchema = z.object({
  result: z
    .string()
    .describe(
      "The result of the task. Formulate this result in a way that is final and does not require further input from the user. " +
        "If you have already provided a detailed response or explanation in your text above, do NOT repeat or copy that content here. " +
        "Instead, simply refer to your response above with a brief sentence (e.g., 'See response above.' or 'The task is completed as described above.') to save output tokens.",
    ),
});

const toolDef = {
  description:
    `Use this tool to end the current agent turn and present its result to the user. Normally, call it only after receiving all tool results and confirming the task is complete.

Exception for background commands: if they are still running and no independent work remains, call this tool now instead of reading their output, polling, or waiting. Do not claim that a background command succeeded or failed before its completion notification arrives. The notification will resume the task with its final status.

You MUST NOT generate any text before this tool call. All conclusion text must be included within the result parameter of the attemptCompletion tool.
Never use this tool with a question or request to engage in further conversation! Formulate the end of your result in a way that is final and does not require further input from the user.

${NoOtherToolsReminderPrompt}
`.trim(),
  inputSchema: attemptCompletionSchema,
  outputSchema: z.discriminatedUnion("success", [
    z.object({
      success: z.literal(true).describe("The completion was accepted."),
    }),
    z.object({
      success: z
        .literal(false)
        .describe(
          "The completion was not accepted; continue working and use the reason as feedback.",
        ),
      reason: z.string().describe("Why the completion was not accepted."),
    }),
  ]),
};

export const attemptCompletion = defineClientTool(toolDef);

export const createAttemptCompletionTool = (schema?: z.ZodType) =>
  defineClientTool({
    ...toolDef,
    // Always wrap in result - use custom schema if provided, otherwise use default string result
    inputSchema: schema
      ? z.object({ result: schema })
      : attemptCompletionSchema,
  });
