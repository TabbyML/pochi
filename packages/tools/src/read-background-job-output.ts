import z from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description:
    `- Retrieves output from a running or completed background job, or from a user-opened terminal
- Takes a backgroundJobId parameter identifying the job or terminal
- Always returns only new content since the last check for that id
- Returns output along with job status
- Supports optional regex filtering to show only lines matching a pattern
- Use this tool when you need to monitor a long-running background job, or catch up on what happened in a user-opened terminal`.trim(),
  inputSchema: z.object({
    backgroundJobId: z
      .string()
      .describe("The ID of the background job or terminal to get output from"),
    regex: z
      .string()
      .optional()
      .describe(
        "Optional regular expression to filter the output lines. Only lines matching this regex will be included in the result. Any lines that do not match will no longer be available to read.",
      ),
  }),
  outputSchema: z.object({
    output: z
      .string()
      .describe(
        "New content since the last check: stdout/stderr for background jobs (bgjob-), or a terminal transcript for user-opened terminals (term-).",
      ),
    status: z
      .enum(["idle", "running", "completed"])
      .describe("The current status of the command"),
    isTruncated: z
      .boolean()
      .optional()
      .describe("Whether the output was truncated"),
  }),
};

export const readBackgroundJobOutput = defineClientTool(toolDef);
