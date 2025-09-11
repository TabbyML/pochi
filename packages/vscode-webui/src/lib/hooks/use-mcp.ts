import type {
  McpConnection,
  McpStatus,
} from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useMcp = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["mcpStatus"],
    queryFn: fetchMcpStatus,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const mcpStatus: McpStatus = data?.value ?? {
    connections: {},
    toolset: {},
    instructions: "",
  };
  const cachedMcpTools = useMcpToolsCache(mcpStatus);

  const mergedConnections: Record<string, McpConnection> = {};
  for (const [name, connection] of Object.entries(mcpStatus.connections)) {
    mergedConnections[name] = {
      ...connection,
      tools:
        Object.keys(connection.tools).length > 0
          ? connection.tools
          : cachedMcpTools[name] || {},
    };
  }

  return {
    connections: mergedConnections,
    toolset: mcpStatus.toolset,
    instructions: mcpStatus.instructions,
    isLoading: isLoading,
  };
};

async function fetchMcpStatus() {
  return threadSignal(await vscodeHost.readMcpStatus());
}

const useMcpToolsCache = (mcpStatus: McpStatus) => {
  const queryClient = useQueryClient();
  const toolsQueries = useQueries({
    queries: Object.keys(mcpStatus.connections).map((name) => ({
      queryKey: ["mcpConnectTools", name],
      queryFn: async () => {
        const connection = mcpStatus.connections[name];
        return {
          name,
          tools: connection?.tools || {},
        };
      },
      enabled: mcpStatus.connections[name]?.status === "ready",
      gcTime: Number.POSITIVE_INFINITY,
    })),
  });
  useEffect(() => {
    for (const name in mcpStatus.connections) {
      if (mcpStatus.connections[name].status === "ready") {
        queryClient.invalidateQueries({
          queryKey: ["mcpConnectTools", name],
        });
      }
    }
  }, [mcpStatus, queryClient]);

  const cachedMcpTools: Record<string, McpConnection["tools"]> = {};
  for (const query of toolsQueries) {
    if (query.data) {
      cachedMcpTools[query.data.name] = query.data.tools;
    }
  }
  return cachedMcpTools;
};
