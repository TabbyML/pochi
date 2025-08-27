import z from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description:
    `- Retrieves output from a running or completed background command
- Takes a backgroundCommandId parameter identifying the command
- Always returns only new output since the last check
- Returns stdout and stderr output along with command status
- Supports optional regex filtering to show only lines matching a pattern
- Use this tool when you need to monitor or check the output of a long-running command`.trim(),
  inputSchema: z.object({
    backgroundCommandId: z
      .string()
      .describe("The ID of the background command to get output from"),
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
        "The output of the background command since last check (including stdout and stderr).",
      ),
    status: z
      .enum(["idle", "running", "completed"])
      .describe("The current status of the command"),
    error: z
      .string()
      .optional()
      .describe("Error message if the command failed"),
    isTruncated: z
      .boolean()
      .optional()
      .describe("Whether the output was truncated"),
    _meta: z.object({
      command: z.string().describe("The command that was executed"),
    }),
  }),
};

export const readCommandOutput = defineClientTool(toolDef);
