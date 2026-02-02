import { z } from "zod";
import { defineClientTool } from "./types";

export const inputSchema = z
  .object({
    path: z.string().describe("The file path to add the review comment to"),
    startLine: z
      .number()
      .int()
      .min(1)
      .describe("The start line number (1-indexed)"),
    endLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("The end line number (1-indexed). Defaults to startLine."),
    comment: z.string().describe("The review comment text"),
  })
  .refine(
    (data) => data.endLine === undefined || data.endLine >= data.startLine,
    {
      message: "endLine must be greater than or equal to startLine",
      path: ["endLine"],
    },
  );

export const createReview = defineClientTool({
  description: `Create a review comment on a specific location in a file.

This tool adds an inline review comment that appears in the VSCode gutter and in the Reviews panel.
Use this to provide code review feedback, highlight issues, or suggest improvements.

The comment will be attached to the specified line range in the file.`.trim(),
  inputSchema,
  outputSchema: z.object({
    success: z.boolean(),
    reviewId: z.string().optional(),
  }),
});
