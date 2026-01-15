import type { McpServerConnection } from "@getpochi/common/mcp-utils";
import type { McpConfigOverride } from "@getpochi/common/vscode-webui-bridge";
import { useCallback, useMemo, useState } from "react";
import { useMcp } from "./use-mcp";

const buildConfigFromConnections = (
  connections: Record<string, McpServerConnection>,
) => {
  const initial: McpConfigOverride = {};
  for (const [serverName, connection] of Object.entries(connections)) {
    if (
      connection.kind === undefined &&
      connection.status === "ready" &&
      !!connection.tools
    ) {
      initial[serverName] = {
        disabledTools: Object.keys(connection.tools)
          .map((t) => (connection.tools[t].disabled === true ? t : undefined))
          .filter((t) => t !== undefined),
      };
    }
  }
  return initial;
};

export function useMcpConfigOverride() {
  const [mcpConfigOverride, setMcpConfigOverride] = useState<McpConfigOverride>(
    {},
  );

  const { connections } = useMcp();

  const globalMcpConfig = useMemo(() => {
    return buildConfigFromConnections(connections);
  }, [connections]);

  const toggleServer = useCallback((serverName: string) => {
    setMcpConfigOverride((prev) => {
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
    setMcpConfigOverride((prev) => {
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
    setMcpConfigOverride(globalMcpConfig);
  }, [globalMcpConfig]);

  return {
    globalMcpConfig,
    mcpConfigOverride,
    toggleServer,
    toggleTool,
    reset,
  };
}
