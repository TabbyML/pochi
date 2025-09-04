import { z } from "zod";
import type { SubTask } from "./new-task";
import { defineClientTool } from "./types";

export const CustomAgent = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.array(z.string()).optional(),
  systemPrompt: z.string().min(1),
});

export type CustomAgent = z.infer<typeof CustomAgent>;

export const newCustomAgent = defineClientTool({
  description: "Run a task with a custom agent.",
  inputSchema: z.object({
    description: z.string().describe("A short description of the task."),
    prompt: z
      .string()
      .describe("The detailed prompt for the task to be performed."),
    agent: z
      .string()
      .describe("The name of the custom agent to use for the task."),
    _meta: z
      .object({
        uid: z.string().describe("A unique identifier for the task."),
      })
      .optional(),
    _transient: z
      .object({
        task: z.custom<SubTask>().describe("The inlined subtask result."),
      })
      .optional(),
  }),
  outputSchema: z.object({
    result: z
      .string()
      .describe(
        "The result of the task, submitted through the `attemptCompletion` tool.",
      ),
  }),
});
