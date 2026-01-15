import LoadingWrapper from "@/components/loading-wrapper";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMcp } from "@/lib/hooks/use-mcp";
import { cn } from "@/lib/utils";
import type { McpServerConnection } from "@getpochi/common/mcp-utils";
import type { TaskMcpTools } from "@getpochi/common/vscode-webui-bridge";
import { DropdownMenuPortal } from "@radix-ui/react-dropdown-menu";
import {
  CheckIcon,
  ChevronsDownUp,
  ChevronsUpDown,
  Dot,
  Settings2Icon,
  WrenchIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

// Helper to trigger VS Code command links programmatically
function triggerCommandLink(href: string) {
  const link = document.createElement("a");
  link.href = href;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

interface McpToolSelectProps {
  triggerClassName?: string;
  taskMcpTools: TaskMcpTools;
  onToggleServer: (serverName: string) => void;
  onToggleTool: (serverName: string, toolName: string) => void;
  resetMcpTools: () => void;
}

export function McpToolSelect({
  triggerClassName,
  taskMcpTools,
  onToggleServer,
  onToggleTool,
  resetMcpTools,
}: McpToolSelectProps) {
  const { t } = useTranslation();
  const { connections, isLoading } = useMcp();

  const userConnections = Object.fromEntries(
    Object.entries(connections).filter(
      ([_, connection]) =>
        connection.kind === undefined &&
        connection.status === "ready" &&
        !!connection.tools,
    ),
  );

  const serverNames = Object.keys(userConnections);
  const hasServers = serverNames.length > 0;

  const enabledCount = Object.keys(taskMcpTools).length;

  const totalToolsCount = Object.values(userConnections).reduce(
    (sum, conn) => sum + Object.keys(conn.tools).length,
    0,
  );

  const enabledToolsCount = Object.entries(taskMcpTools).reduce(
    (sum, [serverName, config]) =>
      sum +
      Object.keys(userConnections[serverName]?.tools ?? {}).length -
      config.disabledTools.length,
    0,
  );

  return (
    <LoadingWrapper
      loading={isLoading}
      fallback={
        <div className="p-1">
          <Skeleton className="h-4 w-20 bg-[var(--vscode-inputOption-hoverBackground)]" />
        </div>
      }
    >
      <div className="h-6 select-none overflow-hidden">
        <DropdownMenu onOpenChange={(isOpen) => isOpen && resetMcpTools()}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "!gap-0.5 !px-1 button-focus h-6 items-center py-0 font-normal",
                      triggerClassName,
                    )}
                  >
                    <WrenchIcon
                      className={cn(
                        "size-4 transition-colors duration-200",
                        !hasServers && "text-muted-foreground",
                      )}
                    />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {hasServers
                    ? `MCP: ${enabledCount}/${serverNames.length} ${t("mcpSelect.servers")}${
                        totalToolsCount > 0
                          ? `, ${enabledToolsCount}/${totalToolsCount} ${t("mcpSelect.tools")}`
                          : ""
                      }`
                    : t("mcpSelect.noServersConfigured")}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuPortal>
            <DropdownMenuContent
              onCloseAutoFocus={(e) => e.preventDefault()}
              side="bottom"
              align="start"
              alignOffset={6}
              className="dropdown-menu w-[20rem] animate-in overflow-hidden rounded-md border bg-background p-0 text-popover-foreground shadow"
            >
              <ScrollArea viewportClassname="max-h-[60vh]">
                <div className="p-2">
                  {hasServers ? (
                    <>
                      <div className="mb-2 px-2 py-1 font-medium text-muted-foreground text-xs">
                        {t("mcpSelect.serversEnabled", {
                          enabled: enabledCount,
                          total: serverNames.length,
                        })}
                        {totalToolsCount > 0 && (
                          <span className="ml-1">
                            ({enabledToolsCount}/{totalToolsCount}{" "}
                            {t("mcpSelect.tools")})
                          </span>
                        )}
                      </div>
                      {serverNames.map((name) => (
                        <McpServerItem
                          key={name}
                          name={name}
                          connection={userConnections[name]}
                          isServerEnabledForTask={name in taskMcpTools}
                          disabledToolsForTask={
                            taskMcpTools?.[name]?.disabledTools
                          }
                          onToggleServer={() => onToggleServer(name)}
                          onToggleTool={(toolName: string) =>
                            onToggleTool(name, toolName)
                          }
                        />
                      ))}
                    </>
                  ) : (
                    <div className="px-2 py-4 text-center text-muted-foreground text-sm">
                      {t("mcpSelect.noServersConfigured")}
                    </div>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a
                      href="command:pochi.mcp.openServerSettings"
                      className="flex cursor-pointer items-center gap-2 text-[var(--vscode-textLink-foreground)] text-xs"
                    >
                      <Settings2Icon className="size-3.5" />
                      {t("mcpSelect.manageServers")}
                    </a>
                  </DropdownMenuItem>
                </div>
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </div>
    </LoadingWrapper>
  );
}

function McpServerItem({
  name,
  connection,
  isServerEnabledForTask,
  disabledToolsForTask,
  onToggleServer,
  onToggleTool,
}: {
  name: string;
  connection: McpServerConnection;
  isServerEnabledForTask?: boolean;
  disabledToolsForTask?: readonly string[];
  onToggleServer: () => void;
  onToggleTool: (toolName: string) => void;
}) {
  const { status, error, tools } = connection;
  const [isExpanded, setIsExpanded] = useState(false);

  const hasTools = tools && Object.keys(tools).length > 0;

  // Use task-level enabled state if provided, otherwise fall back to global running state
  const isEnabled =
    isServerEnabledForTask !== undefined
      ? isServerEnabledForTask
      : status !== "stopped";

  const toolsArray = Object.entries(tools).map(([id, tool]) => ({
    id,
    ...tool,
  }));

  // Count enabled tools based on task-level or global state
  const enabledToolsCount = disabledToolsForTask
    ? toolsArray.filter((t) => !disabledToolsForTask.includes(t.id)).length
    : toolsArray.filter((t) => !t.disabled).length;

  // Global toggle for Dot (start/stop server)
  const handleGlobalToggleServer = useCallback(() => {
    const action = status !== "stopped" ? "stop" : "start";
    const href = `command:pochi.mcp.serverControl?${encodeURIComponent(
      JSON.stringify([action, name]),
    )}`;
    triggerCommandLink(href);
  }, [status, name]);

  return (
    <div className="rounded-md hover:bg-muted/50">
      <div
        className={cn(
          "group flex items-center justify-between px-2 py-1.5",
          hasTools && "cursor-pointer",
        )}
        onClick={() => hasTools && setIsExpanded(!isExpanded)}
      >
        <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
          <Dot
            strokeWidth={6}
            className={cn("size-3 shrink-0 cursor-pointer", {
              "text-muted-foreground": status === "stopped",
              "animate-pulse text-success": status === "starting",
              "text-success": status === "ready",
              "text-error": status === "error",
            })}
            onClick={(e) => {
              e.stopPropagation();
              handleGlobalToggleServer();
            }}
          />
          <span className="truncate font-medium text-sm">{name}</span>
          {hasTools && (
            <span className="text-muted-foreground text-xs">
              ({enabledToolsCount}/{toolsArray.length})
            </span>
          )}
        </div>
        <Switch
          checked={isEnabled}
          disabled={status === "starting"}
          className="scale-75"
          onClick={(e) => {
            e.stopPropagation();
            onToggleServer();
          }}
        />
        {hasTools && (
          <div className="ml-1 p-0.5">
            {isExpanded ? (
              <ChevronsDownUp className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {status === "error" && error && (
        <div className="px-2 pb-1.5 text-error text-xs">
          <span className="line-clamp-2">{error}</span>
        </div>
      )}

      {isExpanded && hasTools && (
        <div className="fade-in slide-in-from-top-1 mb-1 ml-2.5 animate-in pl-2 duration-200">
          {toolsArray.map((tool) => (
            <McpToolItem
              key={tool.id}
              toolName={tool.id}
              description={tool.description}
              disabled={
                isServerEnabledForTask === false
                  ? true
                  : disabledToolsForTask
                    ? disabledToolsForTask.includes(tool.id)
                    : tool.disabled
              }
              serverStatus={status}
              onToggle={onToggleTool}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function McpToolItem({
  toolName,
  description,
  disabled,
  serverStatus,
  onToggle,
}: {
  toolName: string;
  description: string | undefined;
  disabled: boolean;
  serverStatus: McpServerConnection["status"];
  onToggle: (toolName: string) => void;
}) {
  const isNotAvailable = disabled || serverStatus !== "ready";

  const handleClick = useCallback(() => {
    if (serverStatus !== "ready") return;
    onToggle(toolName);
  }, [serverStatus, onToggle, toolName]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "group flex items-center justify-between rounded-sm px-2 py-1 hover:bg-accent hover:text-accent-foreground",
              isNotAvailable && "opacity-50",
              serverStatus === "ready" && "cursor-pointer",
            )}
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
          >
            <span className="truncate text-xs">{toolName}</span>
            <div
              className={cn(
                "mr-7 flex size-3.5 shrink-0 items-center justify-center rounded-sm border",
                disabled
                  ? "border-muted-foreground/50 bg-transparent"
                  : "border-primary bg-primary",
              )}
            >
              {!disabled && (
                <CheckIcon className="size-3 text-primary-foreground" />
              )}
            </div>
          </div>
        </TooltipTrigger>
        {description && (
          <TooltipContent
            side="top"
            align="start"
            sideOffset={-2}
            collisionPadding={16}
            className="z-[100] max-w-80"
          >
            <p className="max-h-40 overflow-auto text-xs">{description}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
