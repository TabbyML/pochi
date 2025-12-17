import { z } from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description: `
Request to read full content from the plan.

Do NOT implement the plan content until the user explicitly asks to process it.
`.trim(),

  inputSchema: z.object({
    // Assuming no specific input is needed to read the plan for now,
    // as the plan might be contextually determined or fetched from a known location.
    // If a plan identifier is needed, this schema would be updated.
  }),
  outputSchema: z.object({
    content: z
      .string()
      .describe("The full content of the implementation plan."),
  }),
};

export const readPlan = defineClientTool(toolDef);
