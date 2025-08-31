import z from "zod/v4";

export const McpServerTransportStdio = z.object({
  command: z.string(),
  args: z.array(z.string()),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});
export type McpServerTransportStdio = z.infer<typeof McpServerTransportStdio>;

export const McpServerTransportHttp = z.object({
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});
export type McpServerTransportHttp = z.infer<typeof McpServerTransportHttp>;

export const McpServerTransport = z.union([
  McpServerTransportStdio,
  McpServerTransportHttp,
]);
export type McpServerTransport = z.infer<typeof McpServerTransport>;

const McpServerCustomization = z.object({
  disabled: z.boolean().optional(),
  disabledTools: z.array(z.string()).optional(),
});

export const McpServerConfig = z.intersection(
  McpServerTransport,
  McpServerCustomization,
);
export type McpServerConfig = z.infer<typeof McpServerConfig>;
