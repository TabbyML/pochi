import LoadingWrapper from "@/components/loading-wrapper";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import type { McpConfigOverride } from "@getpochi/common/vscode-webui-bridge";
import {
  ClipboardList,
  Loader2,
  SendHorizonal,
  Settings2Icon,
  WrenchIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface SubmitDropdownButtonProps {
  isLoading?: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  onSubmitPlan: () => void;
  mcpConfigOverride: McpConfigOverride;
  onToggleServer: (serverName: string) => void;
  resetMcpTools: () => void;
}

export function SubmitDropdownButton({
  isLoading = false,
  disabled = false,
  onSubmit,
  onSubmitPlan,
  mcpConfigOverride,
  onToggleServer,
  resetMcpTools,
}: SubmitDropdownButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);

  if (isLoading) {
    return (
      <span className="p-1">
        <Loader2 className="size-4 animate-spin" />
      </span>
    );
  }

  const handleOpenChange = (open: boolean) => {
    // Don't close if user is still hovering
    if (!open && isHoveringRef.current) {
      return;
    }
    setIsOpen(open);
    if (open && Object.keys(mcpConfigOverride).length === 0) {
      resetMcpTools();
    }
  };

  const handleMouseEnter = () => {
    if (disabled) return;
    isHoveringRef.current = true;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (!isOpen) {
      setIsOpen(true);
      if (Object.keys(mcpConfigOverride).length === 0) {
        resetMcpTools();
      }
    }
  };

  const handleMouseLeave = () => {
    isHoveringRef.current = false;
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringRef.current) {
        setIsOpen(false);
      }
    }, 150);
  };

  return (
    <div className="flex items-center">
      <DropdownMenu open={isOpen} onOpenChange={handleOpenChange} modal={false}>
        <div
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="flex items-center"
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    className={cn(
                      "button-focus h-6 w-6 p-0",
                      isOpen && "bg-accent",
                    )}
                    onClick={onSubmit}
                  >
                    <SendHorizonal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("chat.submitTooltip")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <DropdownMenuPortal>
          <DropdownMenuContent
            onCloseAutoFocus={(e) => e.preventDefault()}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            side="bottom"
            align="end"
            alignOffset={0}
            sideOffset={2}
            className="dropdown-menu w-auto min-w-0 animate-in overflow-hidden rounded-md border bg-background p-0 text-popover-foreground shadow"
          >
            <div className="p-1">
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-2 px-2 py-1"
                onClick={onSubmitPlan}
              >
                <ClipboardList className="size-3.5 transition-colors duration-200" />
                <span>{t("chat.createPlan")}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <McpSubMenu
                mcpConfigOverride={mcpConfigOverride}
                onToggleServer={onToggleServer}
              />
            </div>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    </div>
  );
}

interface McpSubMenuProps {
  mcpConfigOverride: McpConfigOverride;
  onToggleServer: (serverName: string) => void;
}

function McpSubMenu({ mcpConfigOverride, onToggleServer }: McpSubMenuProps) {
  const { t } = useTranslation();
  const { connections, isLoading: isMcpLoading } = useMcp();

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

  return (
    <LoadingWrapper
      loading={isMcpLoading}
      fallback={
        <div className="p-2">
          <Skeleton className="h-4 w-full bg-[var(--vscode-inputOption-hoverBackground)]" />
        </div>
      }
    >
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2 px-2 py-1">
          <WrenchIcon
            className={cn(
              "size-3.5 transition-colors duration-200",
              !hasServers && "text-muted-foreground",
            )}
          />
          <span>{t("mcpSelect.servers")}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent
            className="dropdown-menu w-50 animate-in overflow-hidden rounded-md border bg-background p-0 text-popover-foreground shadow"
            sideOffset={8}
          >
            <ScrollArea viewportClassname="max-h-[60vh]">
              <div className="p-2">
                {hasServers ? (
                  <>
                    {serverNames.map((name) => (
                      <McpServerItem
                        key={name}
                        name={name}
                        connection={userConnections[name]}
                        isServerEnabledForTask={name in mcpConfigOverride}
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
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
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

  return (
    <div className="rounded-md hover:bg-muted/50">
      <div className="group flex items-center justify-between px-2 py-1.5">
        <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
          <span className="truncate font-medium text-sm" title={name}>
            {name}
          </span>
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
