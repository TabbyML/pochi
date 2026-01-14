import { z } from "zod";
import { EditFileOutputSchema, EditFileResultPrompt } from "./constants";
import { defineClientTool } from "./types";

const toolDef = {
  description: `
Request to write full content to a file at the specified path.
If the file exists, it will be overwritten with the provided content.
If the file doesn't exist, it will be created. This tool will automatically create any directories needed to write the file.
Also supports writing to files with the "pochi://" schema.

${EditFileResultPrompt}`.trim(),

  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "The path of the file to write to (relative to the current working directory, or an absolute path).",
      ),
    content: z.string().describe("The content to write to the file."),
  }),
  outputSchema: EditFileOutputSchema,
};

export const writeToFile = defineClientTool(toolDef);
