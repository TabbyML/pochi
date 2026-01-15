import type { McpTool } from "@getpochi/tools";
import * as R from "remeda";
import type { McpServerConnection } from "../mcp-utils";

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
