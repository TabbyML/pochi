import { z } from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description:
    "Request to list files and directories within the specified directory. If recursive is true, it will list all files and directories recursively. If recursive is false or not provided, it will only list the top-level contents. Do not use this tool to confirm the existence of files you may have created, as the user will let you know if the files were created successfully or not.",
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "The path of the directory to list contents for (relative to the current working directory, or an absolute path)",
      ),
    recursive: z
      .boolean()
      .optional()
      .describe("Whether to list files and directories recursively."),
  }),
  outputSchema: z.object({
    files: z.array(z.string()).describe("List of file and directory names"),
    isTruncated: z.boolean().describe("Whether the list of files is truncated"),
  }),
};

export const listFiles = defineClientTool(toolDef);
