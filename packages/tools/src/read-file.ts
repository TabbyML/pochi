import { z } from "zod";
import { defineClientTool } from "./types";

const TextOutput = z.object({
  type: z.literal("text").optional(),
  content: z.string(),
  isTruncated: z
    .boolean()
    .describe(
      "Whether the textual content is truncated due to exceeding the maximum length",
    ),
});

export const MediaOutput = z.object({
  type: z.literal("media"),
  data: z.string().describe("The base64-encoded media data"),
  mimeType: z.string().describe("The MIME type of the media"),
});

export const createReadFileTool = (contentType?: string[]) =>
  defineClientTool({
    description: `Request to read the contents of a file at the specified path. Use this when you need to examine the contents of an existing file you do not know the contents of, for example to analyze code, review text files, extract information from configuration files.
${contentType && contentType.length > 0 ? `Also supports reading media files (e.g. image, audio, video) with the following mime types: ${contentType.join(", ")}.` : ""}`,
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          "The path of the file to read. Use workspace-relative paths for workspace files. If another tool or notification returned this path, pass it exactly as returned, including absolute paths.",
        ),
      startLine: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Legacy 1-based starting line. Prefer offset/limit for new calls. Ignored when offset or limit is provided.",
        ),
      endLine: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Legacy 1-based inclusive ending line. Prefer offset/limit for new calls. Ignored when offset or limit is provided.",
        ),
      offset: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "The 1-based line number to start reading from. Prefer this with limit for large or growing files.",
        ),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "The maximum number of lines to return. Prefer this with offset for large or growing files.",
        ),
    }),
    outputSchema: z
      .union([TextOutput, MediaOutput])
      .describe("The file content as either text or media output."),
  });
