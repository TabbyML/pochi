import { TaskThread } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import { useState } from "react";
import type { NewTaskToolViewProps } from ".";
import { ExpandIcon } from "../tool-container";

interface SubAgentViewProps {
  icon: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  footerActions?: React.ReactNode;
  taskSource: NewTaskToolViewProps["taskSource"];
  toolCallStatusRegistryRef: NewTaskToolViewProps["toolCallStatusRegistryRef"];
  assistantName?: string;
  defaultCollapsed?: boolean;
}

export function SubAgentView({
  icon,
  title,
  actions,
  children,
  footerActions,
  taskSource,
  toolCallStatusRegistryRef,
  assistantName = "Planner",
  defaultCollapsed = false,
}: SubAgentViewProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const showExpandIcon = taskSource && taskSource.messages.length > 1;
  const showFooter = showExpandIcon || footerActions;

  return (
    <div className="mt-2 flex flex-col overflow-hidden rounded-md border shadow-sm">
      <div className="flex items-center gap-2 border-b bg-muted px-3 py-2 font-medium text-muted-foreground text-xs">
        {icon}
        <span className="flex-1 truncate">{title}</span>
        {actions}
      </div>

      {children}

      {showFooter && (
        <div className="flex items-center gap-2 border-t bg-muted p-2">
          {showExpandIcon && (
            <ExpandIcon
              className="mt-1 rotate-270 cursor-pointer text-muted-foreground"
              isExpanded={!isCollapsed}
              onClick={() => setIsCollapsed(!isCollapsed)}
            />
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
