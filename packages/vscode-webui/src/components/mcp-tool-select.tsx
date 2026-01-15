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
import { Dot, Settings2Icon, WrenchIcon } from "lucide-react";
import { useCallback } from "react";
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
  resetMcpTools: () => void;
}

export function McpToolSelect({
  triggerClassName,
  taskMcpTools,
  onToggleServer,
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
                    ? `MCP: ${enabledCount}/${serverNames.length} ${t("mcpSelect.servers")}`
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
                      </div>
                      {serverNames.map((name) => (
                        <McpServerItem
                          key={name}
                          name={name}
                          connection={userConnections[name]}
                          isServerEnabledForTask={name in taskMcpTools}
                          onToggleServer={() => onToggleServer(name)}
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
  onToggleServer,
}: {
  name: string;
  connection: McpServerConnection;
  isServerEnabledForTask?: boolean;
  onToggleServer: () => void;
}) {
  const { status, error } = connection;

  // Use task-level enabled state if provided, otherwise fall back to global running state
  const isEnabled =
    isServerEnabledForTask !== undefined
      ? isServerEnabledForTask
      : status !== "stopped";

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
      <div className="group flex items-center justify-between px-2 py-1.5">
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
      </div>

      {status === "error" && error && (
        <div className="px-2 pb-1.5 text-error text-xs">
          <span className="line-clamp-2">{error}</span>
        </div>
      )}
    </div>
  );
}
