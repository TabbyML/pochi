import { TaskThread } from "@/components/task-thread";
import { Badge } from "@/components/ui/badge";
import { FixedStateChatContextProvider } from "@/features/chat";
import { useNavigate } from "@/lib/hooks/use-navigate";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment } from "@/lib/vscode";
import type { UITools } from "@getpochi/livekit";
import { type ToolUIPart, isToolUIPart } from "ai";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { NewTaskToolViewProps } from ".";
import { StatusIcon } from "../status-icon";
import { ToolCallLite } from "../tool-call-lite";

interface SubAgentViewProps {
  uid?: string;
  tool: NewTaskToolViewProps["tool"];
  isExecuting: NewTaskToolViewProps["isExecuting"];
  actions?: React.ReactNode;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  footerActions?: React.ReactNode;
  taskSource: NewTaskToolViewProps["taskSource"];
  toolCallStatusRegistryRef: NewTaskToolViewProps["toolCallStatusRegistryRef"];
  assistantName?: string;
  defaultCollapsed?: boolean;
  expandable?: boolean;
  icon?: ReactNode;
}

export function SubAgentView({
  uid,
  tool,
  icon,
  isExecuting,
  children,
  headerActions,
  footerActions,
  taskSource,
  toolCallStatusRegistryRef,
  assistantName = "Planner",
  defaultCollapsed = false,
  expandable,
}: SubAgentViewProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const canToggleCollapse =
    expandable && taskSource && taskSource.messages.length > 1;
  const showFooter = canToggleCollapse || footerActions;
  const navigate = useNavigate();
  const store = useDefaultStore();
  const toolTitle = tool.input?.agentType;
  const description = tool.input?.description;
  const lastToolCallRef = useRef<ToolUIPart<UITools>>(null);
  useEffect(() => {
    const lastMessage = taskSource?.messages.at(-1);
    if (!lastMessage || lastMessage.role !== "assistant") {
      return;
    }
    const lastToolCall = lastMessage.parts.findLast(
      (part): part is ToolUIPart<UITools> => {
        return isToolUIPart(part);
      },
    );
    if (lastToolCall) {
      lastToolCallRef.current = lastToolCall;
    }
  }, [taskSource?.messages]);

  return (
    <div className="mt-2 flex flex-col overflow-hidden rounded-md border shadow-sm">
      <div
        className={cn(
          "flex items-center gap-2 border-b bg-muted/30 px-3 py-2 font-medium text-muted-foreground text-xs",
          uid && taskSource?.parentId && isVSCodeEnvironment()
            ? "cursor-pointer transition-colors hover:bg-muted hover:text-foreground"
            : "",
        )}
        onClick={
          uid && taskSource?.parentId && isVSCodeEnvironment()
            ? () => {
                navigate({
                  to: "/task",
                  search: {
                    uid,
                    storeId: store.storeId,
                  },
                  replace: true,
                  viewTransition: true,
                });
              }
            : undefined
        }
      >
        {icon ? (
          icon
        ) : (
          <StatusIcon
            tool={tool}
            isExecuting={isExecuting}
            className="align-baseline"
            iconClassName="size-3.5"
          />
        )}
        <Badge variant="secondary" className={cn("my-0.5 py-0")}>
          {toolTitle}
        </Badge>
        {description && (
          <span className="min-w-0 truncate text-muted-foreground">
            {description}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {headerActions && (
            <div onClick={(e) => e.stopPropagation()}>{headerActions}</div>
          )}
          {uid && taskSource?.parentId && isVSCodeEnvironment() && (
            <div className="flex items-center px-2">
              <ChevronRight className="size-3.5" />
            </div>
          )}
        </div>
      </div>

      {children}

      {showFooter && (
        <div
          className={cn(
            "flex items-center gap-2 border-t bg-muted/30 p-2 text-muted-foreground",
            isCollapsed && "border-b",
            canToggleCollapse &&
              "cursor-pointer transition-colors hover:bg-muted hover:text-foreground",
          )}
          onClick={
            canToggleCollapse ? () => setIsCollapsed(!isCollapsed) : undefined
          }
        >
          {canToggleCollapse && (
            <div className="flex items-center">
              {lastToolCallRef.current && (
                <div className="truncate py-0.5 text-xs">
                  <ToolCallLite
                    tools={[lastToolCallRef.current]}
                    requiresApproval={false}
                    showCommandDetails
                    statusIcon={
                      <StatusIcon
                        tool={tool}
                        isExecuting={isExecuting}
                        className="align-baseline"
                        iconClassName="size-3.5"
                      />
                    }
                  />
                </div>
              )}
            </div>
          )}
          {footerActions && (
            <div
              className="ml-auto flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              {footerActions}
            </div>
          )}
        </div>
      )}

      {isCollapsed && taskSource && taskSource.messages.length > 1 && (
        <div className="p-1">
          <FixedStateChatContextProvider
            toolCallStatusRegistry={toolCallStatusRegistryRef?.current}
          >
            <TaskThread
              source={{ ...taskSource, isLoading: false }}
              showMessageList={true}
              showTodos={false}
              scrollAreaClassName="border-none"
              assistant={{ name: assistantName }}
            />
          </FixedStateChatContextProvider>
        </div>
      )}
    </div>
  );
}
