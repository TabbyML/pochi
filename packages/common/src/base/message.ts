import type { FinishReason, UIMessage } from "ai";
import type { ReadonlyDeep } from "type-fest";
import { z } from "zod";

/** Replaces one message while exposing the existing value as deeply readonly. */
export function updateMessage<T extends UIMessage>(
  messages: T[],
  index: number,
  update: (message: ReadonlyDeep<T>) => Partial<ReadonlyDeep<T>> | undefined,
): T | undefined {
  const message = messages[index];
  if (!message) return;

  const patch = update(message as ReadonlyDeep<T>);
  if (!patch) return message;

  const updatedMessage = { ...message, ...patch } as T;
  messages[index] = updatedMessage;
  return updatedMessage;
}

export const MessageMetadata = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("assistant"),
    totalTokens: z.number(),
    inputTokens: z.number().optional(),
    cacheReadTokens: z.number().optional(),
    // True when `totalTokens` falls back to our heuristic estimate because
    // the provider did not report usage; false/undefined means it's the real
    // token count reported by the provider. Used to gate token-estimate
    // calibration to only trust actual provider usage.
    totalTokensIsEstimated: z.boolean().optional(),
    finishReason: z.custom<FinishReason>(),
    contentFilter: z
      .object({
        provider: z.enum(["anthropic", "google"]),
        reason: z.string().optional(),
        details: z.unknown().optional(),
      })
      .optional(),
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

export const BackgroundJobNotification = z.object({
  notificationId: z.string(),
  backgroundJobId: z.string(),
  outputFile: z.string(),
  command: z.string().optional(),
  status: z.enum(["completed", "failed", "stopped"]),
  summary: z.string(),
  exitCode: z.number().optional(),
  finishedAt: z.number(),
});

export type BackgroundJobNotification = z.infer<
  typeof BackgroundJobNotification
>;

export const BackgroundJobTerminalEvent = z.object({
  taskId: z.string(),
  backgroundJobId: z.string(),
  outputFile: z.string(),
  status: z.enum(["completed", "failed", "stopped"]),
  command: z.string(),
  exitCode: z.number().optional(),
  error: z.string().optional(),
  finishedAt: z.number(),
});

export type BackgroundJobTerminalEvent = z.infer<
  typeof BackgroundJobTerminalEvent
>;

export function createBackgroundJobNotification(
  event: BackgroundJobTerminalEvent,
): BackgroundJobNotification {
  let summary: string;
  if (event.status === "completed") {
    summary = `Background command "${event.command}" completed with exit code ${event.exitCode ?? 0}`;
  } else if (event.status === "stopped") {
    summary = `Background command "${event.command}" was stopped`;
  } else if (event.exitCode !== undefined) {
    summary = `Background command "${event.command}" failed with exit code ${event.exitCode}`;
  } else {
    summary = `Background command "${event.command}" failed${event.error ? `: ${event.error}` : ""}`;
  }

  return {
    notificationId: `${event.backgroundJobId}:terminal`,
    backgroundJobId: event.backgroundJobId,
    outputFile: event.outputFile,
    command: event.command,
    status: event.status,
    summary,
    ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
    finishedAt: event.finishedAt,
  };
}

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
      "Stable ID of the terminal. Find the terminal with this ID in environment.workspace.terminals, then use readFile on its outputFile to read the terminal output.",
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
