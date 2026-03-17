import { z } from "zod";
import { NoOtherToolsReminderPrompt } from "./constants";
import { defineClientTool } from "./types";

const QuestionOptionSchema = z.object({
  label: z
    .string()
    .describe(
      "Short button label shown to the user. Should be concise (1-5 words) and clearly describe the choice.",
    ),
  description: z
    .string()
    .describe(
      "Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications.",
    ),
});

const QuestionSchema = z.object({
  question: z
    .string()
    .describe(
      "The complete question to ask the user. Should be clear, specific, and end with a question mark.",
    ),
  header: z
    .string()
    .max(12)
    .describe(
      'Very short label displayed as a chip/tag (max 12 chars). Examples: "Auth method", "Library", "Approach".',
    ),
  options: z
    .array(QuestionOptionSchema)
    .min(2)
    .max(4)
    .describe(
      "The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice (unless multiSelect is enabled). There should be no 'Other' option, that will be provided automatically.",
    ),
  multiSelect: z
    .boolean()
    .default(false)
    .describe(
      "Set to true to allow the user to select multiple options instead of just one. Use when choices are not mutually exclusive.",
    ),
});

const toolDef = {
  description:
    `Ask the user a question to gather additional information needed to complete the task. 

## When to Use This Tool
Use this tool in the following scenarios:
1. The user's request is ambiguous or unclear and requires clarification.
2. You need more details to proceed effectively.
3. You have made several unsuccessful attempts to solve the issue and need user guidance to move forward.
4. Offer choices to the user about what direction to take.

## Usage Notes
- Users will always be able to select "Other" to provide custom text input
- Use multiSelect: true to allow multiple answers to be selected for a question
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label
- Provide 1-4 questions per call

${NoOtherToolsReminderPrompt}
`.trim(),
  inputSchema: z.object({
    questions: z
      .array(QuestionSchema)
      .min(1)
      .max(4)
      .describe("Questions to ask the user (1-4 questions)."),
  }),
  outputSchema: z.object({
    success: z
      .boolean()
      .describe("Indicates whether the question was successfully asked."),
  }),
};

export const askFollowupQuestion = defineClientTool(toolDef);
