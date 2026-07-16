import type { FinishReason } from "ai";
import { z } from "zod";

export const MessageMetadata = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("assistant"),
    totalTokens: z.number(),
    finishReason: z.custom<FinishReason>(),
    startedAt: z.coerce.date().optional(),
    finishedAt: z.coerce.date().optional(),
    totalStreamingDuration: z.number().optional(),
    totalToolsExecutionDuration: z.number().optional(),
  }),
  z.object({
    kind: z.literal("user"),
    compact: z.boolean().optional(),
  }),
]);

export type MessageMetadata = z.infer<typeof MessageMetadata>;

export const ActiveSelection = z
  .object({
    filepath: z.string().describe("The path of the active file selection."),
    range: z
      .object({
        start: z
          .object({
            line: z
              .number()
              .describe("The starting line number of the selection."),
            character: z
              .number()
              .describe("The starting character number of the selection."),
          })
          .describe("The start position of the selection."),
        end: z
          .object({
            line: z
              .number()
              .describe("The ending line number of the selection."),
            character: z
              .number()
              .describe("The ending character number of the selection."),
          })
          .describe("The end position of the selection."),
      })
      .describe("The range of the active selection."),
    content: z.string().describe("The content of the active selection."),
    notebookCell: z
      .object({
        cellIndex: z
          .number()
          .describe("The zero-based index of the notebook cell."),
        cellId: z
          .string()
          .describe(
            "The ID of the notebook cell. This can be used with the editNotebook tool to edit the cell. Falls back to the cell index as a string if no ID is available.",
          ),
      })
      .optional()
      .describe(
        "Notebook cell information if the selection is in a Jupyter notebook. The cellId can be used directly with the editNotebook tool.",
      ),
  })
  .optional()
  .describe("Active editor selection in the current workspace.");

export type ActiveSelection = z.infer<typeof ActiveSelection>;

export const TerminalTextSelection = z.object({
  terminalName: z
    .string()
    .describe("Name of the terminal the text was selected in."),
  backgroundJobId: z
    .string()
    .optional()
    .describe(
      "Stable id of the terminal (see TerminalState.getTerminalId / environment.workspace.terminals), usable with readBackgroundJobOutput.",
    ),
  content: z.string().describe("The selected text content in the terminal."),
});

export type TerminalTextSelection = z.infer<typeof TerminalTextSelection>;

export const UserEdits = z
  .array(
    z.object({
      filepath: z.string().describe("Relative file path"),
      diff: z.string().describe("Diff content with inline markers"),
    }),
  )
  .optional()
  .describe("User edits since last checkpoint in the current workspace.");

export type UserEdits = z.infer<typeof UserEdits>;

export const BashOutputs = z.array(
  z.object({
    command: z.string().describe("The command that was executed."),
    output: z.string().describe("The output of the command."),
    error: z.string().describe("The error of the command.").optional(),
  }),
);

export type BashOutputs = z.infer<typeof BashOutputs>;

export type ReviewComment = {
  id: string;
  body: string;
};

export type ReviewCodeSnippet = {
  content: string;
  startLine: number;
  endLine: number;
};

export type Review = {
  id: string;
  uri: string;
  range?: {
    start: Position;
    end: Position;
  };
  comments: ReviewComment[];
  codeSnippet: ReviewCodeSnippet;
};

type Position = {
  line: number;
  character: number;
};
