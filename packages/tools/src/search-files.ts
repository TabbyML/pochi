import { z } from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description: `
- Fast content search tool that works with any codebase size
- Searches file contents using regular expressions
- Supports Rust regex syntax (eg. "log.*Error", "function\s+\w+", etc.)
- Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")
- Returns file paths with at least one match sorted by modification time
- Use this tool when you need to find files containing specific patterns
- Craft your regex patterns carefully to balance specificity and flexibility.
- Based on the user's task you may use it to find code patterns, TODO comments, function definitions, or any text-based information across the project. The results include context, so analyze the surrounding code to better understand the matches. Leverage the this tool in combination with other tools for more comprehensive analysis. For example, use it to find specific code patterns, then use readFile to examine the full context of interesting matches before using applyDiff or writeToFile to make informed changes.

`.trim(),
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "The path of the directory to search in (relative to the current working directory).",
      ),
    regex: z
      .string()
      .describe(
        "The regular expression pattern to search for in file contents. Uses Rust regex syntax.",
      ),
    filePattern: z
      .string()
      .optional()
      .describe(
        'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}"). If not provided, it will search all files.',
      ),
  }),
  outputSchema: z.object({
    matches: z
      .array(
        z.object({
          file: z.string().describe("The file where the match was found."),
          line: z.number().describe("The line number of the match."),
          context: z.string().describe("The surrounding context of the match."),
        }),
      )
      .describe("List of matches found in the search."),
    isTruncated: z
      .boolean()
      .describe(
        "Whether the content is truncated due to exceeding the maximum buffer length",
      ),
  }),
};

export const searchFiles = defineClientTool(toolDef);
