import type { McpToolStatus } from "@getpochi/common/vscode-webui-bridge";

export function omitDisabled<T extends McpToolStatus>(
  tool: T,
): Omit<T, "disabled"> {
  const { disabled, ...rest } = tool;
  return rest;
}
