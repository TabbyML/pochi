import z from "zod/v4";

const McpServerTransportStdioFields = {
  command: z.string(),
  args: z.array(z.string()),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
};

export const McpServerTransportStdio = z.object(McpServerTransportStdioFields);
export type McpServerTransportStdio = z.infer<typeof McpServerTransportStdio>;

const McpServerTransportHttpFields = {
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
};
export const McpServerTransportHttp = z.object(McpServerTransportHttpFields);
export type McpServerTransportHttp = z.infer<typeof McpServerTransportHttp>;

export const McpServerTransport = z.union([
  McpServerTransportStdio,
  McpServerTransportHttp,
]);
export type McpServerTransport = z.infer<typeof McpServerTransport>;

const BaseMcpServerCustomization = z.object({
  disabled: z.boolean().optional(),
  disabledTools: z.array(z.string()).optional(),
});

export const McpServerConfig = z.union([
  BaseMcpServerCustomization.extend(McpServerTransportHttpFields),
  BaseMcpServerCustomization.extend(McpServerTransportStdioFields),
]);

export type McpServerConfig = z.infer<typeof McpServerConfig>;
