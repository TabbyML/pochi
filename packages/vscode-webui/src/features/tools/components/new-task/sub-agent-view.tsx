import { TaskThread } from "@/components/task-thread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FixedStateChatContextProvider } from "@/features/chat";
import { useNavigate } from "@/lib/hooks/use-navigate";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment } from "@/lib/vscode";
import type { UITools } from "@getpochi/livekit";
import { isUserInputToolPart } from "@getpochi/tools";
import { type ToolUIPart, isToolUIPart } from "ai";
import { useEffect, useRef, useState } from "react";
import type { NewTaskToolViewProps } from ".";
import { StatusIcon } from "../status-icon";
import { ToolCallLite } from "../tool-call-lite";
import { ExpandIcon } from "../tool-container";

interface SubAgentViewProps {
  uid?: string;
  tool: NewTaskToolViewProps["tool"];
  isExecuting: NewTaskToolViewProps["isExecuting"];
  actions?: React.ReactNode;
  children: React.ReactNode;
  footerActions?: React.ReactNode;
  taskSource: NewTaskToolViewProps["taskSource"];
  toolCallStatusRegistryRef: NewTaskToolViewProps["toolCallStatusRegistryRef"];
  assistantName?: string;
  defaultCollapsed?: boolean;
  expandable?: boolean;
}

export function SubAgentView({
  uid,
  tool,
  isExecuting,
  children,
  footerActions,
  taskSource,
  toolCallStatusRegistryRef,
  assistantName = "Planner",
  defaultCollapsed = false,
  expandable = true,
}: SubAgentViewProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const showExpandIcon =
    expandable && taskSource && taskSource.messages.length > 1;
  const showFooter = showExpandIcon || footerActions;
  const navigate = useNavigate();
  const store = useDefaultStore();
  const toolTitle = tool.input?.agentType;
  const description = tool.input?.description;
  const lastToolCall = useRef<ToolUIPart<UITools>>(null);

  useEffect(() => {
    const lastMessage = taskSource?.messages.at(-1);
    if (!isExecuting || !lastMessage || lastMessage.role !== "assistant") {
      return;
    }
    const pendingToolCall = lastMessage.parts.find(
      (part): part is ToolUIPart<UITools> =>
        isToolUIPart(part) &&
        part.state === "input-available" &&
        !isUserInputToolPart(part),
    );
    if (pendingToolCall) {
      lastToolCall.current = pendingToolCall;
    }
  }, [isExecuting, taskSource?.messages]);

  return (
    <div className="mt-2 flex flex-col overflow-hidden rounded-md border shadow-sm">
      <div className="flex items-center gap-2 border-b bg-muted px-3 py-2 font-medium text-muted-foreground text-xs">
        <StatusIcon
          tool={tool}
          isExecuting={isExecuting}
          className="align-baseline"
          iconClassName="size-3.5"
        />
        <Badge variant="secondary" className={cn("my-0.5 py-0")}>
          {uid && taskSource?.parentId && isVSCodeEnvironment() ? (
            <Button
              variant="link"
              className="h-auto p-0 font-inherit text-inherit underline-offset-2"
              onClick={() => {
                navigate({
                  to: "/task",
                  search: {
                    uid,
                    storeId: store.storeId,
                  },
                  replace: true,
                  viewTransition: true,
                });
              }}
            >
              {toolTitle}
            </Button>
          ) : (
            <>{toolTitle}</>
          )}
        </Badge>
        {description && (
          <span className="min-w-0 truncate text-muted-foreground">
            {description}
          </span>
        )}
      </div>

      {children}

      {showFooter && (
        <div className="flex items-center gap-2 border-t bg-muted p-2">
          {showExpandIcon && (
            <div className="flex items-center">
              <ExpandIcon
                className="mt-1 rotate-270 cursor-pointer text-muted-foreground"
                isExpanded={!isCollapsed}
                onClick={() => setIsCollapsed(!isCollapsed)}
              />
              {isExecuting && lastToolCall.current && (
                <div className="truncate text-muted-foreground text-xs">
                  <ToolCallLite
                    tools={[lastToolCall.current]}
                    textOnly
                    showDetails
                  />
                </div>
              )}
            </div>
          )}
          {footerActions && (
            <div className="ml-auto flex items-center gap-2">
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
