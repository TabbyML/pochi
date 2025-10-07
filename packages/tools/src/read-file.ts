import { z } from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description:
    "Request to read the contents of a file at the specified path. Use this when you need to examine the contents of an existing file you do not know the contents of, for example to analyze code, review text files, or extract information from configuration files.",
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "The path of the file to read (relative to the current working directory, or an absolute path)",
      ),
    startLine: z
      .number()
      .optional()
      .describe(
        "The starting line number to read from (1-based). If not provided, it starts from the beginning of the file.",
      ),
    endLine: z
      .number()
      .optional()
      .describe(
        "The ending line number to read to (1-based, inclusive). If not provided, it reads to the end of the file.",
      ),
  }),
  outputSchema: z.object({
    content: z.string().describe("The contents of the file"),
    isTruncated: z
      .boolean()
      .describe(
        "Whether the content is truncated due to exceeding the maximum length",
      ),
  }),
};

export const readFile = defineClientTool(toolDef);
