import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useMcp } from "@/lib/hooks/use-mcp";
import { cn } from "@/lib/utils";
import type { McpServerConnection } from "@getpochi/common/mcp-utils";
import { Blocks, ChevronLeft, ChevronsUpDown, Dot } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AutoApprove } from "../store";

interface McpAutoApproveSectionProps {
  autoApproveSettings: AutoApprove;
  onUpdateSettings: (data: Partial<AutoApprove>) => void;
}

interface McpServerItemProps {
  serverName: string;
  server: McpServerConnection;
  isServerSelected: boolean;
  isExpanded: boolean;
  selectedTools: string[];
  onSelectServer: (serverName: string, enabled: boolean) => void;
  onSelectTool: (
    serverName: string,
    toolName: string,
    enabled: boolean,
  ) => void;
  onSelectAllTools: (serverName: string) => void;
  onClearAllTools: (serverName: string) => void;
  onToggleExpanded: (serverName: string) => void;
}

function McpServerSelectionItem({
  serverName,
  server,
  isServerSelected,
  isExpanded,
  selectedTools,
  onSelectServer,
  onSelectTool,
  onSelectAllTools,
  onClearAllTools,
  onToggleExpanded,
}: McpServerItemProps) {
  const { t } = useTranslation();

  const tools = Object.entries(server.tools).map(([toolName, tool]) => ({
    toolName,
    disabled: tool.disabled || false,
  }));

  const totalToolsCount = tools.filter((t) => !t.disabled).length;
  const selectedToolsCount = selectedTools.filter((toolName) => {
    const tool = tools.find((t) => t.toolName === toolName);
    return tool && !tool.disabled;
  }).length;

  const onClickServerHeader = () => {
    if (isServerSelected) {
      onToggleExpanded(serverName);
    } else {
      onSelectServer(serverName, true);
    }
  };

  return (
    <div className="rounded-md border px-2">
      <div className="flex h-10 w-full select-none items-center justify-between">
        <div className="flex items-center gap-2 pl-2">
          <Checkbox
            id={`mcp-server-${serverName}`}
            checked={isServerSelected}
            onCheckedChange={(checked) => onSelectServer(serverName, !!checked)}
          />
        </div>
        <div
          className="flex flex-1 cursor-pointer items-center overflow-x-hidden"
          onClick={onClickServerHeader}
        >
          <Dot
            className={cn("size-6 shrink-0", {
              "text-muted-foreground": server.status === "stopped",
              "animate-pulse text-success": server.status === "starting",
              "text-success": server.status === "ready",
              "text-error": server.status === "error",
            })}
          />
          <span className="truncate font-semibold text-sm">{serverName}</span>
          {isServerSelected && (
            <span className="ml-2 text-foreground/60 text-xs">
              {t("settings.autoApprove.toolsSelectedCount", {
                selected: selectedToolsCount,
                total: totalToolsCount,
              })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isServerSelected && (
            <ChevronsUpDown
              className={cn(
                "size-5 cursor-pointer",
                isExpanded && "rotate-180",
              )}
              onClick={() => onToggleExpanded(serverName)}
            />
          )}
        </div>
      </div>
      <div
        className={cn(
          "origin-top overflow-hidden pl-2 transition-all duration-100 ease-in-out",
          isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {isServerSelected && tools.length > 0 && (
          <>
            <hr className="border-muted" />
            <div className="py-2">
              <div className="mb-2 flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-sm"
                  onClick={() => onSelectAllTools(serverName)}
                >
                  {t("settings.autoApprove.selectAll")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-sm"
                  onClick={() => onClearAllTools(serverName)}
                >
                  {t("settings.autoApprove.clearAll")}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {tools.map((tool) => (
                  <label
                    key={tool.toolName}
                    htmlFor={`mcp-tool-${serverName}-${tool.toolName}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 py-0.5",
                      tool.disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <Checkbox
                      id={`mcp-tool-${serverName}-${tool.toolName}`}
                      checked={
                        !tool.disabled && selectedTools.includes(tool.toolName)
                      }
                      disabled={tool.disabled}
                      onCheckedChange={(checked) =>
                        onSelectTool(serverName, tool.toolName, !!checked)
                      }
                    />
                    <span
                      className={cn(
                        "truncate text-foreground/80 text-sm",
                        tool.disabled && "line-through",
                      )}
                    >
                      {tool.toolName}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        {isServerSelected && tools.length === 0 && (
          <>
            <hr className="border-muted" />
            <div className="flex w-full justify-center py-2 text-foreground/60 text-sm">
              {t("settings.autoApprove.noToolsAvailable")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function getAvailableToolNames(server?: McpServerConnection): string[] {
  if (!server) {
    return [];
  }
  return Object.entries(server.tools)
    .filter(([_, tool]) => !tool.disabled)
    .map(([toolName, _]) => toolName);
}

export function McpAutoApproveSection({
  autoApproveSettings,
  onUpdateSettings,
}: McpAutoApproveSectionProps) {
  const { t } = useTranslation();
  const { connections, isLoading: isMcpLoading } = useMcp();
  const [expandedMcpServers, setExpandedMcpServers] = useState<
    Record<string, boolean>
  >({});
  const [isOpen, setIsOpen] = useState(false);
  const isMcpSelected = autoApproveSettings.mcp.enabled;

  const handleSelectApproveMcp = (enabled: boolean) => {
    if (enabled) {
      // Only select all servers and tools by default if no servers are currently configured
      const selectedServers =
        Object.keys(autoApproveSettings.mcp.servers).length === 0
          ? Object.entries(connections).reduce(
              (acc, [serverName, server]) => {
                // Get all non-disabled tools for this server
                const availableTools = getAvailableToolNames(server);
                acc[serverName] = { tools: availableTools };
                return acc;
              },
              {} as Record<string, { tools: string[] }>,
            )
          : autoApproveSettings.mcp.servers;

      onUpdateSettings({
        mcp: {
          ...autoApproveSettings.mcp,
          enabled: true,
          servers: selectedServers,
        },
      });
      setIsOpen(true);
    } else {
      onUpdateSettings({
        mcp: {
          ...autoApproveSettings.mcp,
          enabled: false,
          servers: {},
        },
      });
    }
  };

  const handleSelectApproveMcpServer = (
    serverName: string,
    enabled: boolean,
  ) => {
    const selectedServers = { ...autoApproveSettings.mcp.servers };

    const availableTools = getAvailableToolNames(connections[serverName]);

    if (enabled) {
      selectedServers[serverName] = {
        tools: availableTools,
      };
    } else {
      delete selectedServers[serverName];
    }

    setExpandedMcpServers((prev) => ({
      ...prev,
      [serverName]: enabled,
    }));

    onUpdateSettings({
      mcp: {
        ...autoApproveSettings.mcp,
        servers: selectedServers,
      },
    });
  };

  const handleSelectApproveMcpTool = (
    serverName: string,
    toolName: string,
    enabled: boolean,
  ) => {
    const selectedServers = { ...autoApproveSettings.mcp.servers };
    if (!selectedServers[serverName]) {
      selectedServers[serverName] = { tools: [] };
    }
    const tools = [...selectedServers[serverName].tools];
    if (enabled) {
      if (!tools.includes(toolName)) {
        tools.push(toolName);
      }
    } else {
      const index = tools.indexOf(toolName);
      if (index > -1) {
        tools.splice(index, 1);
      }
    }

    selectedServers[serverName] = { ...selectedServers[serverName], tools };

    onUpdateSettings({
      mcp: {
        ...autoApproveSettings.mcp,
        servers: selectedServers,
      },
    });
  };

  const handleSelectAllTools = (serverName: string) => {
    const server = connections[serverName];
    const toolNames = getAvailableToolNames(server);
    const selectedServers = { ...autoApproveSettings.mcp.servers };
    selectedServers[serverName] = {
      ...selectedServers[serverName],
      tools: [...toolNames],
    };
    onUpdateSettings({
      mcp: {
        ...autoApproveSettings.mcp,
        servers: selectedServers,
      },
    });
  };

  const handleClearAllTools = (serverName: string) => {
    const selectedServers = { ...autoApproveSettings.mcp.servers };
    selectedServers[serverName] = {
      ...selectedServers[serverName],
      tools: [],
    };
    onUpdateSettings({
      mcp: {
        ...autoApproveSettings.mcp,
        servers: selectedServers,
      },
    });
  };

  const isMcpServerSelected = (serverName: string) => {
    return serverName in autoApproveSettings.mcp.servers;
  };

  const handleToggleExpanded = (serverName: string) => {
    setExpandedMcpServers((prev) => ({
      ...prev,
      [serverName]: !prev[serverName],
    }));
  };

  const onOpen = () => {
    if (isMcpSelected) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <>
      <div
        className={cn(
          "group flex w-full items-center justify-between text-left focus:outline-none",
          isMcpSelected && "cursor-pointer",
        )}
        onClick={onOpen}
      >
        <div className="flex flex-1 select-none items-center pl-1 text-foreground text-sm">
          <Checkbox
            id="mcp-toggle"
            checked={isMcpSelected}
            onCheckedChange={handleSelectApproveMcp}
            onClick={(e) => e.stopPropagation()}
          />
          <label
            htmlFor={!isMcpSelected ? "mcp-toggle" : ""}
            className="cursor-pointer"
          >
            <span className="ml-4 flex items-center gap-2 font-semibold">
              <Blocks className="size-4 shrink-0" />
              <span className="whitespace-nowrap text-foreground text-sm">
                {t("settings.autoApprove.useMcpServers")}
              </span>
            </span>
          </label>
        </div>
        {isMcpSelected && (
          <ChevronLeft
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-in-out",
              isOpen ? "-rotate-90" : "",
            )}
          />
        )}
      </div>
      <div
        className={cn(
          "origin-top overflow-hidden transition-all duration-100 ease-in-out",
          isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0",
          {
            "mt-2": isOpen,
          },
        )}
      >
        {autoApproveSettings.mcp.enabled && (
          <div className="max-h-[200px] space-y-2 overflow-y-auto">
            {isMcpLoading ? (
              <div className="text-foreground/60 text-sm">
                {t("settings.mcp.loading")}
              </div>
            ) : Object.keys(connections).length === 0 ? (
              <div className="text-foreground/60 text-sm">
                {t("settings.autoApprove.noMcpServers")}
              </div>
            ) : (
              Object.entries(connections).map(([serverName, server]) => (
                <McpServerSelectionItem
                  key={serverName}
                  serverName={serverName}
                  server={server}
                  isServerSelected={isMcpServerSelected(serverName)}
                  isExpanded={expandedMcpServers[serverName] || false}
                  selectedTools={
                    autoApproveSettings.mcp.servers[serverName]?.tools || []
                  }
                  onSelectServer={handleSelectApproveMcpServer}
                  onSelectTool={handleSelectApproveMcpTool}
                  onSelectAllTools={handleSelectAllTools}
                  onClearAllTools={handleClearAllTools}
                  onToggleExpanded={handleToggleExpanded}
                />
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
