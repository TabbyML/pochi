import { z } from "zod";
import { EditFileOutputSchema, EditFileResultPrompt } from "./constants";
import { defineClientTool } from "./types";

const toolDef = {
  description: `This is a tool for editing files. For moving or renaming files, you should generally use the executeCommand tool with the 'mv' command instead. For larger edits, use the writeFile tool to overwrite files.

Before using this tool, use the readFile tool to understand the file's contents and context

To make a file edit, provide the following:
1. path: The path to the file to modify (relative to the current working directory, or an absolute path)
2. searchContent: The text to replace (must match the file contents exactly, including all whitespace and indentation)
3. replaceContent: The edited text to replace the searchContent (must be different from searchContent)
4. expectedReplacements: The number of replacements you expect to make. Defaults to 1 if not specified.

By default, the tool will replace ONE occurrence of searchContent with replaceContent in the specified file. If you want to replace multiple occurrences, provide the expectedReplacements parameter with the exact number of occurrences you expect.

CRITICAL REQUIREMENTS FOR USING THIS TOOL:

1. UNIQUENESS (when expectedReplacements is not specified): The searchContent MUST uniquely identify the specific instance you want to change. This means:
   - Include AT LEAST 3-5 lines of context BEFORE the change point
   - Include AT LEAST 3-5 lines of context AFTER the change point
   - Include all whitespace, indentation, and surrounding code exactly as it appears in the file

2. EXPECTED MATCHES: If you want to replace multiple instances:
   - Use the expectedReplacements parameter with the exact number of occurrences you expect to replace
   - This will replace ALL occurrences of the searchContent with the replaceContent
   - If the actual number of matches doesn't equal expectedReplacements, the edit will fail
   - This is a safety feature to prevent unintended replacements

3. VERIFICATION: Before using this tool:
   - Check how many instances of the target text exist in the file
   - If multiple instances exist, either:
     a) Gather enough context to uniquely identify each one and make separate calls, OR
     b) Use expectedReplacements parameter with the exact count of instances you expect to replace

WARNING:
- The tool will fail if searchContent matches multiple locations and expectedReplacements isn't specified
- The tool will fail if the number of matches doesn't equal expectedReplacements when it's specified
- The tool will fail if searchContent doesn't match the file contents exactly (including whitespace)
- The tool will fail if searchContent and replaceContent are the same

When making edits:
   - Ensure the edit results in idiomatic, correct code
   - Do not add trailing whitespace to lines (a newline at the end of a file is fine)
   - Do not leave the code in a broken state

If you want to create a new file, use:
   - A new file path, including dir name if needed
   - An empty searchContent
   - The new file's contents as replaceContent

Remember: when making multiple file edits in a row to the same file, you should prefer to send all edits in a single message with multiple calls to this tool, rather than multiple messages with a single call each.

${EditFileResultPrompt}`,
  inputSchema: z.object({
    path: z
      .string()
      .describe(
        "The path of the file to modify (relative to the current working directory, or an absolute path).",
      ),
    searchContent: z.string().describe("The text to replace."),
    replaceContent: z.string().describe("The text to replace it with."),
    expectedReplacements: z
      .number()
      .optional()
      .describe(
        "The expected number of replacements to perform. Defaults to 1 if not specified.",
      ),
  }),
  outputSchema: EditFileOutputSchema,
};

export const applyDiff = defineClientTool(toolDef);
