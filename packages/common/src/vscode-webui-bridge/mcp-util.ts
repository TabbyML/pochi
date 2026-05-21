import type { McpTool } from "@getpochi/tools";
import * as R from "remeda";
import type { McpServerConnection } from "../mcp-utils";
import type { McpConfigOverride } from "./types/task";

/**
 * Sort entries of a Record alphabetically by key. Used to make the MCP
 * server / tool enumeration order deterministic so the resulting prompt
 * (system instructions + tools JSON) is byte-identical across requests
 * regardless of MCP server registration order. This is required for stable
 * Anthropic prompt-cache hits across parent/fork tasks, parallel tasks, and
 * cross-session shared caches.
 */
const sortedEntries = <T>(record: Record<string, T>): [string, T][] =>
  Object.entries(record).sort(([a], [b]) => a.localeCompare(b));

export const buildInstructionsFromConnections = (
  connections: Record<string, McpServerConnection>,
) => {
  return sortedEntries(connections)
    .filter(([, conn]) => !!conn.instructions)
    .map(
      ([name, conn]) =>
        `# Instructions from ${name} mcp server\n${conn.instructions}`,
    )
    .join("\n\n");
};

export const buildToolsetFromConnections = (
  connections: Record<string, McpServerConnection>,
): Record<string, McpTool> => {
  // Iterate connections in name-sorted order, and within each connection
  // iterate its tools in name-sorted order, so the merged toolset has a
  // deterministic key order.
  const merged: Record<string, McpTool> = {};
  for (const [, connection] of sortedEntries(connections)) {
    if (connection.status !== "ready" || !connection.tools) continue;
    for (const [toolName, tool] of sortedEntries(connection.tools)) {
      if (tool.disabled) continue;
      merged[toolName] = R.omit(tool, ["disabled"]) as McpTool;
    }
  }
  return merged;
};

export const buildTaskScopedMcpInfo = (
  connections: Record<string, McpServerConnection>,
  mcpConfigOverride: McpConfigOverride,
) => {
  const filteredConnections: typeof connections = {};

  for (const [serverName, connection] of Object.entries(connections)) {
    if (connection.kind === "vendor") {
      filteredConnections[serverName] = connection;
      continue;
    }

    const serverConfig = mcpConfigOverride[serverName];
    if (!serverConfig) {
      continue;
    }

    const newConn = { ...connection };
    const newTools: typeof newConn.tools = {};
    for (const [toolName, tool] of Object.entries(connection.tools)) {
      if (!serverConfig.disabledTools.includes(toolName)) {
        newTools[toolName] = tool;
      }
    }
    newConn.tools = newTools;
    filteredConnections[serverName] = newConn;
  }

  return {
    toolset: buildToolsetFromConnections(filteredConnections),
    instructions: buildInstructionsFromConnections(filteredConnections),
  };
};
