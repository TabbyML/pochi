import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FixedStateChatContextProvider,
  ToolCallStatusRegistry,
} from "@/features/chat";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { Link } from "@tanstack/react-router";
import { type RefObject, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useInlinedSubTask } from "../../hooks/use-inlined-sub-task";
import { useLiveSubTask } from "../../hooks/use-live-sub-task";
import { StatusIcon } from "../status-icon";
import { ExpandIcon, ToolTitle } from "../tool-container";
import type { ToolProps } from "../types";
import { PlanCard } from "./plan-card";

interface NewTaskToolProps extends ToolProps<"newTask"> {
  // For storybook visualization
  taskThreadSource?: TaskThreadSource;
}

export const newTaskTool: React.FC<NewTaskToolProps> = (props) => {
  const { tool, taskThreadSource } = props;
  const uid = tool.input?._meta?.uid;
  const isRunAsync = tool.input?.runAsync;

  let taskSource: (TaskThreadSource & { parentId?: string }) | undefined =
    taskThreadSource;

  const inlinedTaskSource = useInlinedSubTask(tool);

  if (isRunAsync) {
    return <BackgroundTaskToolView {...props} uid={uid} />;
  }

  if (inlinedTaskSource) {
    taskSource = inlinedTaskSource;
  }

  if (!inlinedTaskSource && uid && isVSCodeEnvironment()) {
    return <LiveSubTaskToolView {...props} uid={uid} />;
  }

  return <NewTaskToolView {...props} taskSource={taskSource} uid={uid} />;
};

function BackgroundTaskToolView(
  props: NewTaskToolProps & { uid: string | undefined },
) {
  const { tool, isExecuting, uid } = props;
  const { t } = useTranslation();
  const store = useDefaultStore();
  const agentType = tool.input?.agentType;
  const toolTitle = agentType ?? "Subtask";
  const description = tool.input?.description ?? "";
  const cwd = window.POCHI_TASK_INFO?.cwd;
  const storeId = store.storeId;

  const canOpen = isVSCodeEnvironment() && !!uid && !!cwd;
  const openInTab = () => {
    if (!uid || !cwd) return;
    vscodeHost.openTaskInPanel({
      type: "open-task",
      uid,
      cwd,
      storeId,
    });
  };

  return (
    <div>
      <ToolTitle className="justify-between">
        <span className={cn("flex items-center gap-2")}>
          <StatusIcon tool={tool} isExecuting={isExecuting} />
          <Badge variant="secondary" className={cn("my-0.5 mr-1 ml-2 py-0")}>
            {toolTitle}
          </Badge>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={openInTab}
          disabled={!canOpen}
        >
          {t("toolInvocation.openTask")}
        </Button>
      </ToolTitle>
      <div className="mt-1 ml-7 flex flex-col gap-1">
        <div className="rounded border border-border/60 bg-muted/40 px-2 py-1 text-muted-foreground text-xs">
          {t("toolInvocation.backgroundTaskStarted")}
        </div>
        {description && (
          <div className="text-muted-foreground text-xs">{description}</div>
        )}
      </div>
    </div>
  );
}

function LiveSubTaskToolView(props: NewTaskToolProps & { uid: string }) {
  const { tool, isExecuting, uid } = props;
  const subTaskToolCallStatusRegistry = useRef(new ToolCallStatusRegistry());

  const taskSource = useLiveSubTask(
    { tool, isExecuting },
    subTaskToolCallStatusRegistry.current,
  );

  return <NewTaskToolView {...props} taskSource={taskSource} uid={uid} />;
}

interface NewTaskToolViewProps extends ToolProps<"newTask"> {
  taskSource?: (TaskThreadSource & { parentId?: string }) | undefined;
  uid: string | undefined;
  toolCallStatusRegistryRef?: RefObject<ToolCallStatusRegistry>;
}

function NewTaskToolView({
  tool,
  isExecuting,
  taskSource,
  uid,
  toolCallStatusRegistryRef,
}: NewTaskToolViewProps) {
  const store = useDefaultStore();
  const agent = tool.input?.agentType;
  const description = tool.input?.description ?? "";
  const agentType = tool.input?.agentType;
  const toolTitle = agentType ?? "Subtask";
  const completed =
    tool.state === "output-available" &&
    "result" in tool.output &&
    tool.output.result.trim().length > 0;

  const [showMessageList, setShowMessageList, setShowMessageListImmediately] =
    useShowMessageList(completed);

  // Collapse when execution completes
  const wasCompleted = useRef(completed);
  useEffect(() => {
    if (!wasCompleted.current && !isExecuting && completed) {
      setShowMessageList(false);
    }
  }, [isExecuting, completed, setShowMessageList]);
  return (
    <div>
      <ToolTitle>
        <span className={cn("flex items-center gap-2")}>
          <div>
            <StatusIcon tool={tool} isExecuting={isExecuting} />
            <Badge variant="secondary" className={cn("my-0.5 mr-1 ml-2 py-0")}>
              {uid && taskSource?.parentId && isVSCodeEnvironment() ? (
                <Link
                  to="/task"
                  search={{
                    uid,
                    storeId: store.storeId,
                  }}
                  replace={true}
                  viewTransition
                >
                  {toolTitle}
                </Link>
              ) : (
                <>{toolTitle}</>
              )}
            </Badge>
            <span className="ml-2">{description}</span>
          </div>
        </span>
        {taskSource && taskSource.messages.length > 1 && (
          <ExpandIcon
            className="cursor-pointer"
            isExpanded={showMessageList}
            onClick={() => setShowMessageListImmediately(!showMessageList)}
          />
        )}
      </ToolTitle>
      {taskSource && taskSource.messages.length > 1 && (
        <FixedStateChatContextProvider
          toolCallStatusRegistry={toolCallStatusRegistryRef?.current}
        >
          <TaskThread
            source={{ ...taskSource, isLoading: false }}
            showMessageList={showMessageList}
            assistant={{ name: agent ?? "Pochi" }}
          />
        </FixedStateChatContextProvider>
      )}
      {agentType === "planner" && completed && uid && taskSource?.parentId && (
        <PlanCard uid={uid} parentId={taskSource.parentId} />
      )}
    </div>
  );
}

function useShowMessageList(completed: boolean) {
  return useDebounceState(!completed, 1_500, {
    leading: !isVSCodeEnvironment(),
  });
}
