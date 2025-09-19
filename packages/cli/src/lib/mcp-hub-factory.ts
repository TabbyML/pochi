import { pochiConfig } from "@getpochi/common/configuration";
import { McpHub } from "@getpochi/common/mcp-utils";
import { computed } from "@preact/signals-core";

/**
 * Creates a McpHub instance configured for CLI environment
 * @param workingDirectory Current working directory for the CLI
 * @returns Configured McpHub instance
 */
export function createCliMcpHub(workingDirectory: string): McpHub {
  // Create a computed signal for MCP servers configuration
  const mcpServersSignal = computed(() => pochiConfig.value.mcp || {});

  const mcpHub = new McpHub({
    configSignal: mcpServersSignal,
    clientName: "pochi-cli",
  });

  return mcpHub;
}
