import { type Tool, jsonSchema, tool } from "@ai-sdk/provider-utils";
import type { McpTool } from "@getpochi/tools";
import type { JSONValue } from "ai";
import z from "zod";

import { remoteUriToBase64 } from "../remote-file";

export function parseMcpToolSet(
  mcpToolSet: Record<string, McpTool> | undefined,
): Record<string, Tool> | undefined {
  return mcpToolSet
    ? Object.fromEntries(
        Object.entries(mcpToolSet).map(([name, tool]) => [
          name,
          parseMcpTool(name, tool),
        ]),
      )
    : undefined;
}

const ContentOutput = z.union([
  z.object({
    content: z.array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("text"),
          text: z.string(),
        }),
        z.object({
          type: z.literal("image"),
          data: z.string(),
          mimeType: z.string(),
        }),
      ]),
    ),
  }),
  z.object({
    error: z.string(),
  }),
]);

function parseMcpTool(_name: string, mcpTool: McpTool): Tool {
  return tool({
    description: mcpTool.description,
    inputSchema: jsonSchema(mcpTool.inputSchema.jsonSchema),
    toModelOutput: (output) => {
      if (typeof output === "string") {
        return {
          type: "text",
          value: output,
        };
      }

      const parsed = ContentOutput.safeParse(output);
      if (!parsed.success) {
        return {
          type: "json",
          value: toJSONValue(output),
        };
      }

      const { data } = parsed;
      if ("error" in data) {
        return {
          type: "error-text" as const,
          value: data.error,
        };
      }

      const contentOutput = {
        type: "content" as const,
        value: data.content.map((item) => {
          if (item.type === "text") {
            return item;
          }

          const blob = remoteUriToBase64(new URL(item.data), item.mimeType);
          if (!blob) {
            return {
              type: "text" as const,
              text: item.data,
            };
          }

          return {
            type: "media" as const,
            ...blob,
          };
        }),
      };

      return contentOutput;
    },
  });
}

function toJSONValue(value: unknown): JSONValue {
  return value === undefined ? null : (value as JSONValue);
}
