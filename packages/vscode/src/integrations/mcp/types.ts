import type { McpToolStatus } from "@getpochi/common/vscode-webui-bridge";
import type { ToolCallOptions } from "ai";
import z from "zod";

const McpServerTransportStdio = z.object({
  command: z.string(),
  args: z.array(z.string()),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});
type McpServerTransportStdio = z.infer<typeof McpServerTransportStdio>;

const McpServerTransportHttp = z.object({
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});
type McpServerTransportHttp = z.infer<typeof McpServerTransportHttp>;

const McpServerTransport = z.union([
  McpServerTransportStdio,
  McpServerTransportHttp,
]);
type McpServerTransport = z.infer<typeof McpServerTransport>;

const McpServerCustomization = z.object({
  disabled: z.boolean().optional(),
  disabledTools: z.array(z.string()).optional(),
});

export const McpServerConfig = z.intersection(
  McpServerTransport,
  McpServerCustomization,
);
export type McpServerConfig = z.infer<typeof McpServerConfig>;

export function isStdioTransport(
  config: McpServerTransport,
): config is McpServerTransportStdio {
  return "command" in config;
}

export function isHttpTransport(
  config: McpServerTransport,
): config is McpServerTransportHttp {
  return "url" in config && !("command" in config);
}

export interface McpToolExecutable {
  execute?(args: unknown, options: ToolCallOptions): Promise<unknown>;
}

export function isExecutable(
  tool: McpToolExecutable,
): tool is McpToolExecutable & {
  execute: (args: unknown, options?: ToolCallOptions) => Promise<unknown>;
} {
  return typeof tool?.execute === "function";
}

export function omitDisabled<T extends McpToolStatus>(
  tool: T,
): Omit<T, "disabled"> {
  const { disabled, ...rest } = tool;
  return rest;
}
