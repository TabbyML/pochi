import type { McpServerConnection } from "@getpochi/common/mcp-utils";
import type { TaskMcpTools } from "@getpochi/common/vscode-webui-bridge";
import { useCallback, useState } from "react";
import { useMcp } from "./use-mcp";

const buildToolsFromConnections = (
  connections: Record<string, McpServerConnection>,
) => {
  const initial: TaskMcpTools = {};
  for (const [serverName, connection] of Object.entries(connections)) {
    if (
      connection.kind === undefined &&
      connection.status === "ready" &&
      !!connection.tools
    ) {
      initial[serverName] = { disabledTools: [] };
    }
  }
  return initial;
};

export function useTaskMcpTools() {
  const { connections } = useMcp();

  const [mcpTools, setMcpTools] = useState<TaskMcpTools>({});

  const toggleServer = useCallback((serverName: string) => {
    setMcpTools((prev) => {
      const next = { ...prev };
      if (serverName in next) {
        delete next[serverName];
      } else {
        next[serverName] = { disabledTools: [] };
      }
      return next;
    });
  }, []);

  const toggleTool = useCallback((serverName: string, toolName: string) => {
    setMcpTools((prev) => {
      const serverConfig = prev[serverName];
      if (!serverConfig) {
        return prev;
      }

      const disabledTools = serverConfig.disabledTools;
      const isDisabled = disabledTools.includes(toolName);

      return {
        ...prev,
        [serverName]: {
          disabledTools: isDisabled
            ? disabledTools.filter((t) => t !== toolName)
            : [...disabledTools, toolName],
        },
      };
    });
  }, []);

  const reset = useCallback(() => {
    const initial = buildToolsFromConnections(connections);
    setMcpTools(initial);
  }, [connections]);

  return {
    mcpTools,
    toggleServer,
    toggleTool,
    reset,
  };
}
