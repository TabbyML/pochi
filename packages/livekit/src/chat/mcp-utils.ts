import { type Tool, jsonSchema, tool } from "@ai-sdk/provider-utils";
import type { McpTool } from "@getpochi/tools";

function parseMcpTool(name: string, mcpTool: McpTool): Tool {
  const toModelOutput = toModelOutputFn[name] || undefined;
  return tool({
    description: mcpTool.description,
    inputSchema: jsonSchema(mcpTool.inputSchema.jsonSchema),
    toModelOutput,
  });
}

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

const toModelOutputFn: Record<string, Tool["toModelOutput"]> = {
  browser_take_screenshot: (output: {
    content: Array<
      | { type: "text"; text: string }
      | { type: "image"; mimeType: string; data: string }
    >;
  }) => {
    return {
      type: "content",
      value: output.content.map((item) => {
        if (item.type === "text") {
          return item;
        }
        return {
          type: "media",
          data: item.data,
          mediaType: item.mimeType,
        };
      }),
    };
  },
};
