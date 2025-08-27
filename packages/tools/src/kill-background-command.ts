import z from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description: `- Kills a running background command by its ID
- Takes a backgroundCommandId parameter identifying the command to kill
- Returns a success or failure status
- Use this tool when you need to terminate a long-running command`.trim(),
  inputSchema: z.object({
    backgroundCommandId: z
      .string()
      .describe("The ID of the background command to kill."),
  }),
  outputSchema: z.object({
    success: z
      .boolean()
      .describe("Whether the background command was successfully killed."),
    _meta: z.object({
      command: z.string().describe("The command that was killed."),
    }),
  }),
};

export const killBackgroundCommand = defineClientTool(toolDef);
