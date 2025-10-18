import { z } from "zod";
import { defineClientTool } from "./types";

const TextOutputSchema = z.object({
  type: z.literal("text").optional(),
  content: z.string(),
  isTruncated: z
    .boolean()
    .describe(
      "Whether the textual content is truncated due to exceeding the maximum length",
    ),
});

const MediaOutputSchema = z.object({
  type: z.literal("media"),
  data: z.string().describe("The base64-encoded media data"),
  mimeType: z.string().describe("The MIME type of the media"),
  isTruncated: z.boolean().describe("Whether the media is truncated"),
});

export const createReadFileTool = (supportedMimeTypes?: string[]) =>
  defineClientTool({
    description: `Request to read the contents of a file at the specified path. Use this when you need to examine the contents of an existing file you do not know the contents of, for example to analyze code, review text files, extract information from configuration files.
${supportedMimeTypes && supportedMimeTypes.length > 0 ? `Also supports reading media files (e.g. image, audio, video) with the following mime types: ${supportedMimeTypes.join(", ")}.` : ""}`,
    inputSchema: z.object({
      path: z
        .string()
        .describe(
          "The path of the file to read (relative to the current working directory, or an absolute path)",
        ),
      startLine: z
        .number()
        .optional()
        .describe(
          "The starting line number to read from (1-based). If not provided, it starts from the beginning of the file.",
        ),
      endLine: z
        .number()
        .optional()
        .describe(
          "The ending line number to read to (1-based, inclusive). If not provided, it reads to the end of the file.",
        ),
    }),
    outputSchema: z
      .union([TextOutputSchema, MediaOutputSchema])
      .describe("The file content as either text or media output."),
    toModelOutput(output) {
      if (output.type === "media") {
        return {
          type: "content",
          value: [
            {
              type: "media",
              data: output.data,
              mediaType: output.mimeType,
            },
          ],
        };
      }

      return {
        type: "text",
        value: output.content,
      };
    },
  });
