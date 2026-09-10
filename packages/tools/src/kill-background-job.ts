import z from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description: `- Kills a running background job by its ID
- Takes a backgroundJobId parameter identifying the job to kill
- Returns a success or failure status
- Use this tool when you need to terminate a long-running background job`.trim(),
  inputSchema: z.object({
    backgroundJobId: z
      .string()
      .describe("The ID of the background job to kill."),
  }),
  outputSchema: z.object({
    success: z
      .boolean()
      .describe("Whether the background job was successfully killed."),
  }),
};

export const killBackgroundJob = defineClientTool(toolDef);
