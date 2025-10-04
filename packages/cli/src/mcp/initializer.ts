import ora from "ora";
import { createCliMcpHub } from "../lib/mcp-hub-factory";

/**
 * Initialize MCP connections with a spinner showing progress
 * @param mcpHub The MCP hub instance to initialize
 * @returns Promise that resolves when initialization is complete
 */
export async function initializeMcp() {
  const mcpHub = await createCliMcpHub();
  // Skip if no connections are configured
  if (Object.keys(mcpHub.status.value.connections).length === 0) {
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
      if (readyConnections + errorConnections >= connections.length) {
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    attempts++;
  }

  // Simply stop the spinner without showing any final status
  spinner.stop();

  return mcpHub;
}
