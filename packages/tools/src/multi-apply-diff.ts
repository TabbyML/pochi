import { z } from "zod";
import { EditFileOutputSchema, EditFileResultPrompt } from "./constants";
import { defineClientTool } from "./types";

const toolDef = {
  description: `
This is a tool for making multiple edits to a single file in one operation. It is built on top of the applyDiff tool and allows you to perform multiple find-and-replace operations efficiently. Prefer this tool over the applyDiff tool when you need to make multiple edits to the same file.

Before using this tool, use the readFile tool to understand the file's contents and context

To make multiple file edits, provide the following:
1. path: The path to the file to modify (relative to the current working directory, or an absolute path)
2. edits: An array of edit operations to perform, where each edit contains:
   - searchContent: The text to replace (must match the file contents exactly, including all whitespace and indentation)
   - replaceContent : The edited text to replace the old_string
   - expectedReplacements: The number of replacements you expect to make. Defaults to 1 if not specified.

IMPORTANT:
- All edits are applied in sequence, in the order they are provided
- Each edit operates on the result of the previous edit
- All edits must be valid for the operation to succeed - if any edit fails, none will be applied
- This tool is ideal when you need to make several changes to different parts of the same file

CRITICAL REQUIREMENTS:
1. All edits follow the same requirements as the single applyDiff tool
2. The edits are atomic - either all succeed or none are applied
3. Plan your edits carefully to avoid conflicts between sequential operations

WARNING:
- The tool will fail if edits.searchContent matches multiple locations and edits.expectedReplacements isn't specified
- The tool will fail if the number of matches doesn't equal edits.expectedReplacements when it's specified
- The tool will fail if edits.searchContent doesn't match the file contents exactly (including whitespace)
- The tool will fail if edits.searchContent and edits.replaceContent are the same
- Since edits are applied in sequence, ensure that earlier edits don't affect the text that later edits are trying to find

When making edits:
- Ensure all edits result in idiomatic, correct code
- Do not leave the code in a broken state

If you want to create a new file, use:
- A new file path, including dir name if needed
- First edit: empty old_string and the new file's contents as new_string
- Subsequent edits: normal edit operations on the created content

${EditFileResultPrompt}`.trim(),
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "The path of the file to modify (relative to the current working directory, or an absolute path).",
      ),
    edits: z
      .array(
        z.object({
          searchContent: z.string().describe("The text to replace."),
          replaceContent: z.string().describe("The text to replace it with."),
          expectedReplacements: z
            .number()
            .optional()
            .describe(
              "The expected number of replacements to perform. Defaults to 1 if not specified.",
            ),
        }),
      )
      .describe(
        "A list of search and replace operations to apply to the file.",
      ),
  }),
  outputSchema: EditFileOutputSchema, // Assuming similar output structure for now
};

const multiApplyDiff = defineClientTool(toolDef);
export type multiApplyDiff = typeof multiApplyDiff;
