import z from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description: `- Kills a running background shell by its ID
- Takes a shellId parameter identifying the shell to kill
- Returns a success or failure status 
- Use this tool when you need to terminate a long-running shell`.trim(),
  inputSchema: z.object({
    shellId: z.string().describe("The ID of the shell to kill."),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the shell was successfully killed."),
    error: z
      .string()
      .optional()
      .describe("An error message if the kill failed."),
  }),
};

export const killShell = defineClientTool(toolDef);
