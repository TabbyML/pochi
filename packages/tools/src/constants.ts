import { z } from "zod";

export const EditFileResultPrompt =
  `You may see the following fields in the result:
- autoFormattingEdits: If the auto-formatter makes any changes, this field will contain a diff against the file content after your edits and any user edits have been applied.
- newProblems: If any new problems are found after the edit, this field will contain information about them.
`.trim();

export const EditFileOutputSchema = z.object({
  success: z
    .boolean()
    .describe("Indicates whether the file was successfully written."),

  autoFormattingEdits: z
    .string()
    .describe(
      "The auto-formatting edits to the file, only present if the auto formatter made changes.",
    )
    .optional(),

  newProblems: z
    .string()
    .optional()
    .describe("The new problems found after writing the file, if any."),

  _meta: z
    .object({
      edit: z
        .string()
        .describe("The diff representing the edits made to the file.")
        .optional(),
      editSummary: z
        .object({
          added: z.number().describe("Number of lines added to the file."),
          removed: z
            .number()
            .describe("Number of lines removed from the file."),
        })
        .optional()
        .describe("A summary of the edits made to the file."),
    })
    .optional()
    .describe(
      "Metadata that would be removed before sending to the LLM (e.g. UI specific data).",
    ),

  _transient: z
    .object({
      resolvedProblems: z
        .string()
        .optional()
        .describe("The problems resolved after writing the file, if any."),
    })
    .optional(),
});

export const NoOtherToolsReminderPrompt =
  "IMPORTANT: This tool CANNOT be used in combination with other tools (except todoWrite) in a single step. If you need to use other tools, you must do so in a separate step before calling this tool.";

/**
 * Permission-grouped tool name lists.
 * Defined here (no dependency on generated types) so any module can safely
 * import without creating circular dependencies with `index.ts`.
 */
export const ToolsByPermission = {
  read: [
    "readFile",
    "listFiles",
    "globFiles",
    "searchFiles",
    "readBackgroundJobOutput",
    "useSkill",
    // Pochi offered-tools
    "webFetch",
    "webSearch",
  ] as string[],
  write: ["writeToFile", "applyDiff", "editNotebook"] as string[],
  execute: [
    "executeCommand",
    "startBackgroundJob",
    "killBackgroundJob",
    "newTask",
  ] as string[],
  default: ["todoWrite"] as string[],
};

export const MaxToolCallConcurrency = 20;
