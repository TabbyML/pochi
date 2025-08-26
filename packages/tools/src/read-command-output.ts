import z from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description: `- Retrieves output from a running or completed background shell
- Takes a backgroundCommandId parameter identifying the shell
- Always returns only new output since the last check
- Returns stdout and stderr output along with shell status
- Supports optional regex filtering to show only lines matching a pattern
- Use this tool when you need to monitor or check the output of a long-running shell`.trim(),
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
    isTruncated: z
      .boolean()
      .optional()
      .describe("Whether the output was truncated"),
  }),
};

export const readCommandOutput = defineClientTool(toolDef);
