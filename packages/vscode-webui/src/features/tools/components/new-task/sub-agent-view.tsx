import { TaskThread } from "@/components/task-thread";
import { Button } from "@/components/ui/button";
import { FixedStateChatContextProvider } from "@/features/chat";
import { useNavigate } from "@/lib/hooks/use-navigate";
import { useDefaultStore } from "@/lib/use-default-store";
import { isVSCodeEnvironment } from "@/lib/vscode";
import { SquareArrowOutUpRight } from "lucide-react";
import { useState } from "react";
import type { NewTaskToolViewProps } from ".";
import { StatusIcon } from "../status-icon";
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
  const title = tool.input?.description;

  const handleOpenTask = () => {
    if (uid) {
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
  };

  return (
    <div className="mt-2 flex flex-col overflow-hidden rounded-md border shadow-sm">
      <div className="flex items-center gap-2 border-b bg-muted px-3 py-2 font-medium text-muted-foreground text-xs">
        <StatusIcon
          tool={tool}
          isExecuting={isExecuting}
          className="align-baseline"
          iconClassName="size-3.5"
        />
        <span className="flex-1 truncate">{title}</span>
        {isVSCodeEnvironment() && (
          <Button
            size="icon"
            variant="ghost"
            disabled={isExecuting}
            onClick={handleOpenTask}
            className="size-auto px-2 py-1"
          >
            <SquareArrowOutUpRight className="size-3.5" />
          </Button>
        )}
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
