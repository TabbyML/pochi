import type { McpTool } from "@getpochi/tools";
import * as R from "remeda";
import type { McpServerConnection } from "../mcp-utils";
import type { McpConfigOverride } from "./types/task";

export const buildInstructionsFromConnections = (
  connections: Record<string, McpServerConnection>,
) => {
  return Object.entries(connections)
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
  return R.mergeAll(
    R.values(
      R.pickBy(
        connections,
        (connection) => connection.status === "ready" && !!connection.tools,
      ),
    )
      .map((connection) => R.pickBy(connection.tools, (tool) => !tool.disabled))
      .map((tool) => R.mapValues(tool, (tool) => R.omit(tool, ["disabled"]))),
  );
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
