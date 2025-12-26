import { useMcp } from "@/lib/hooks/use-mcp";
import { useEffect, useRef } from "react";
import type { AutoApprove } from "../store";
import type { McpServerConnection } from "@getpochi/common/mcp-utils";

interface UseMcpAutoApproveDefaultsProps {
  autoApproveSettings: AutoApprove;
  updateAutoApproveSettings: (data: Partial<AutoApprove>) => void;
}

export function getAvailableToolNames(server?: McpServerConnection): string[] {
  if (!server) {
    return [];
  }
  return Object.entries(server.tools)
    .filter(([_, tool]) => !tool.disabled)
    .map(([toolName, _]) => toolName);
}

export function getDisabledToolNames(server?: McpServerConnection): string[] {
  if (!server) {
    return [];
  }
  return Object.entries(server.tools)
    .filter(([_, tool]) => !!tool.disabled)
    .map(([toolName, _]) => toolName);
}

/**
 * Hook that automatically sets up default MCP auto-approve settings
 * by enabling all MCP servers and their tools when mcp is true
 * but mcpServers is undefined (not configured yet).
 */
export function useMcpAutoApproveDefaults({
  autoApproveSettings,
  updateAutoApproveSettings,
}: UseMcpAutoApproveDefaultsProps) {
  const { connections, isLoading } = useMcp();
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Only run once when:
    // 1. MCP connections are loaded
    // 2. MCP is enabled (mcp: true)
    // 3. mcpServers is undefined (not configured yet)
    // 4. We haven't already initialized
    if (
      isLoading ||
      hasInitialized.current ||
      !autoApproveSettings.mcp ||
      autoApproveSettings.mcpServers !== undefined
    ) {
      return;
    }

    // Check if there are any connections available
    if (Object.keys(connections).length === 0) {
      return;
    }

    // Build the default mcpServers object with all servers and their tools
    const sortedServerNames = Object.keys(connections).sort();
    const defaultMcpServers: Record<string, { tools: string[] }> = {};

    for (const serverName of sortedServerNames) {
      const server = connections[serverName];
      const availableTools = getAvailableToolNames(server);
      defaultMcpServers[serverName] = { tools: availableTools.sort() };
    }

    updateAutoApproveSettings({ mcpServers: defaultMcpServers });
    hasInitialized.current = true;
  }, [
    autoApproveSettings.mcp,
    autoApproveSettings.mcpServers,
    connections,
    isLoading,
    updateAutoApproveSettings,
  ]);
}
