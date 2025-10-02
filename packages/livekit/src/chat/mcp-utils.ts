import { type Tool, jsonSchema, tool } from "@ai-sdk/provider-utils";
import type { McpTool } from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import type { JSONValue } from "ai";
import z from "zod";
import { StoreBlobProtocol } from "..";
import { makeBlobQuery } from "../livestore/queries";

export function parseMcpToolSet(
  store: Store,
  mcpToolSet: Record<string, McpTool> | undefined,
): Record<string, Tool> | undefined {
  return mcpToolSet
    ? Object.fromEntries(
        Object.entries(mcpToolSet).map(([name, tool]) => [
          name,
          parseMcpTool(store, name, tool),
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
          blobUri: z.string(),
        }),
      ]),
    ),
  }),
  z.object({
    error: z.string(),
  }),
]);

function parseMcpTool(store: Store, _name: string, mcpTool: McpTool): Tool {
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

          const blob = findBlob(store, new URL(item.blobUri));
          if (!blob) {
            return {
              type: "text" as const,
              text: item.blobUri,
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

function toBase64(bytes: Uint8Array) {
  const binString = Array.from(bytes, (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  const base64 = btoa(binString);
  return base64;
}

function findBlob(store: Store, url: URL) {
  if (url.protocol === StoreBlobProtocol) {
    const blob = store.query(makeBlobQuery(url.pathname));
    if (blob) {
      return {
        data: toBase64(blob.data),
        mediaType: blob.mimeType,
      };
    }
  }
}
