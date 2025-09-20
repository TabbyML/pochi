import { pochiConfig } from "@getpochi/common/configuration";
import type { McpHub } from "@getpochi/common/mcp-utils";
import ora from "ora";

/**
 * Initialize MCP connections with a spinner showing progress
 * @param mcpHub The MCP hub instance to initialize
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeMcp(mcpHub: McpHub): Promise<void> {
  const mcpConfig = pochiConfig.value.mcp || {};
  const hasMcpServers = Object.keys(mcpConfig).length > 0;

  if (!hasMcpServers) {
    return;
  }

  // Wait for MCP connections to establish before starting the task
  const spinner = ora("Initializing MCP connections...").start();
  let attempts = 0;
  const maxAttempts = 15;

  while (attempts < maxAttempts) {
    const status = mcpHub.status.value;
    const connections = Object.values(status.connections);
    const readyConnections = connections.filter(
      (conn) => conn.status === "ready",
    ).length;
    const errorConnections = connections.filter(
      (conn) => conn.status === "error",
    ).length;

    if (connections.length > 0) {
      // Wait for ALL non-error connections to be ready
      if (
        readyConnections + errorConnections >= connections.length &&
        attempts > 3
      ) {
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    attempts++;
  }

  // Simply stop the spinner without showing any final status
  spinner.stop();
}
