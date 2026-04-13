import { TaskThread } from "@/components/task-thread";
import { Badge } from "@/components/ui/badge";
import { FixedStateChatContextProvider } from "@/features/chat";
import { useNavigate } from "@/lib/hooks/use-navigate";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment } from "@/lib/vscode";
import type { UITools } from "@getpochi/livekit";
import { type ToolUIPart, isStaticToolUIPart } from "ai";
import { useEffect, useRef, useState } from "react";
import type { NewTaskToolViewProps } from ".";
import { StatusIcon } from "../status-icon";
import { ToolCallLite } from "../tool-call-lite";
import { ExpandIcon } from "../tool-container";

interface SubAgentViewProps {
  uid?: string;
  tool: NewTaskToolViewProps["tool"];
  isExecuting: NewTaskToolViewProps["isExecuting"];
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  footerActions?: React.ReactNode;
  taskSource: NewTaskToolViewProps["taskSource"];
  toolCallStatusRegistryRef?: NewTaskToolViewProps["toolCallStatusRegistryRef"];
  assistantName?: string;
  showToolCall?: boolean;
  showTaskThread?: boolean;
}

export function SubAgentView({
  uid,
  tool,
  isExecuting,
  children,
  headerActions,
  footerActions,
  taskSource,
  toolCallStatusRegistryRef,
  assistantName = tool.input?.agentType ?? "Pochi",
  showToolCall,
  showTaskThread = true,
}: SubAgentViewProps) {
  const lastToolCallRef = useRef<ToolUIPart<UITools>>(null);
  const [showFooterTaskThread, setShowFooterTaskThread] = useState(false);
  const showToolCallLite =
    showToolCall &&
    isExecuting &&
    taskSource &&
    taskSource.messages.length > 1 &&
    !!lastToolCallRef.current;
  const canShowFooterTaskThread =
    showTaskThread && !!taskSource && taskSource.messages.length > 1;

  const showFooter =
    showToolCallLite || footerActions || canShowFooterTaskThread;
  const navigate = useNavigate();
  const store = useDefaultStore();
  const toolTitle = tool.input?.agentType;
  const description = tool.input?.description;

  useEffect(() => {
    const lastMessage = taskSource?.messages.at(-1);
    if (!lastMessage || lastMessage.role !== "assistant") {
      return;
    }
    const lastToolCall = lastMessage.parts.findLast(
      (part): part is ToolUIPart<UITools> => {
        return isStaticToolUIPart(part);
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
          "flex items-start gap-2 border-b bg-muted/30 px-3 py-2 font-medium text-muted-foreground text-xs",
          uid && taskSource?.parentId && isVSCodeEnvironment()
            ? "group cursor-pointer transition-colors hover:bg-muted hover:text-foreground"
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
        <StatusIcon
          tool={tool}
          isExecuting={isExecuting}
          className="mt-1 self-start leading-none"
          iconClassName="size-3.5"
        />
        <div className="min-w-0 flex-1 break-words text-muted-foreground leading-5">
          <Badge
            variant="secondary"
            className={cn("mr-2 inline-flex py-0 align-middle")}
          >
            {toolTitle}
          </Badge>
          {description && (
            <span className="break-words align-middle group-hover:underline">
              {description}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {headerActions && (
            <div onClick={(e) => e.stopPropagation()}>{headerActions}</div>
          )}
        </div>
      </div>

      {children}

      {showFooter && (
        <>
          <div className="flex items-center gap-2 overflow-x-hidden border-t bg-muted/30 px-2 py-1.5 text-muted-foreground">
            {(canShowFooterTaskThread || showToolCallLite) && (
              <div
                className={cn(
                  "group flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-sm px-1.5 py-1",
                  canShowFooterTaskThread && "cursor-pointer",
                )}
                onClick={
                  canShowFooterTaskThread
                    ? () => {
                        setShowFooterTaskThread((value) => !value);
                      }
                    : undefined
                }
              >
                {canShowFooterTaskThread && (
                  <div className="flex shrink-0 items-center">
                    <ExpandIcon
                      isExpanded={showFooterTaskThread}
                      className="cursor-pointer opacity-100 transition-colors hover:bg-secondary hover:text-foreground"
                    />
                  </div>
                )}
                {showToolCallLite && lastToolCallRef.current && (
                  <div
                    className={cn(
                      "animated-gradient-text min-w-0 flex-1 truncate text-xs",
                      canShowFooterTaskThread &&
                        "group-hover:underline group-hover:underline-offset-2",
                    )}
                  >
                    <ToolCallLite
                      tools={[lastToolCallRef.current]}
                      requiresApproval={false}
                      showCommandDetails
                      showStatusIcon={false}
                    />
                  </div>
                )}
              </div>
            )}
            {footerActions && (
              <div className="ml-auto flex shrink-0 items-center gap-2 px-1">
                {footerActions}
              </div>
            )}
          </div>

          {canShowFooterTaskThread && showFooterTaskThread && taskSource && (
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
        </>
      )}
    </div>
  );
}
