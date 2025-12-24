import { z } from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description:
    `Ask the user a question to gather additional information needed to complete the task. 

## When to Use This Tool
Use this tool in the following scenarios:
1. The user's request is ambiguous or unclear and requires clarification.
2. You need more details to proceed effectively.
3. You have made several unsuccessful attempts to solve the issue and need user guidance to move forward.

IMPORTANT: This tool CANNOT be used in combination with other tools (except todoWrite) in a single step. If you need to use other tools, you must do so in a separate step before calling this tool.
`.trim(),
  inputSchema: z.object({
    question: z.string().describe("The question to ask the user."),
    followUp: z
      .array(z.string())
      .describe(
        "A list of 2-4 suggested answers that logically follow from the question.",
      ),
  }),
  outputSchema: z.object({
    success: z
      .boolean()
      .describe("Indicates whether the question was successfully asked."),
  }),
};

export const askFollowupQuestion = defineClientTool(toolDef);
