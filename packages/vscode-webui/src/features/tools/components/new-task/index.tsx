import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BackgroundTaskButton,
  FixedStateChatContextProvider,
  ToolCallStatusRegistry,
  useToolCallLifeCycle,
} from "@/features/chat";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useNavigate } from "@/lib/hooks/use-navigate";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment } from "@/lib/vscode";
import { constants } from "@getpochi/common";
import { getStaticToolName } from "ai";
import { SendToBack } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useThrottle } from "react-use";
import { useInlinedSubTask } from "../../hooks/use-inlined-sub-task";
import { useLiveSubTask } from "../../hooks/use-live-sub-task";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";
import { AttemptTodoCompletionView } from "./attempt-todo-completion-view";
import { BackgroundSubagentStatusIcon } from "./background-status-icon";
import { BrowserView } from "./browser-view";
import { PlannerView } from "./planner-view";
import { hasNewTaskResult } from "./result";
import { TodoDetail } from "./todo-detail";

const SubtaskPreviewThrottleMs = 300;

interface NewTaskToolProps extends ToolProps<"newTask"> {
  // For storybook visualization
  taskThreadSource?: TaskThreadSource;
}

export const newTaskTool: React.FC<NewTaskToolProps> = (props) => {
  const { tool, taskThreadSource } = props;
  const uid = tool.input?._meta?.uid;

  let taskSource: (TaskThreadSource & { parentId?: string }) | undefined =
    taskThreadSource;

  const inlinedTaskSource = useInlinedSubTask(tool);

  if (inlinedTaskSource) {
    taskSource = inlinedTaskSource;
  }

  if (!inlinedTaskSource && uid && isVSCodeEnvironment()) {
    return <LiveSubTaskToolView {...props} uid={uid} />;
  }

  return <NewTaskToolView {...props} taskSource={taskSource} uid={uid} />;
};

function LiveSubTaskToolView(props: NewTaskToolProps & { uid: string }) {
  const { tool, isExecuting, uid } = props;
  const subTaskToolCallStatusRegistry = useRef(new ToolCallStatusRegistry());

  const taskSource = useLiveSubTask(
    { tool, isExecuting },
    subTaskToolCallStatusRegistry.current,
  );

  const lifecycle = useToolCallLifeCycle().getToolCallLifeCycle({
    toolName: getStaticToolName(tool),
    toolCallId: tool.toolCallId,
  });
  const agentType =
    tool.state !== "input-streaming" ? tool.input?.agentType : undefined;
  const parentId = taskSource?.parentId;
  const canMoveToBackground =
    isExecuting &&
    lifecycle.status === "execute:streaming" &&
    !!parentId &&
    !tool.input?.background &&
    agentType !== "browser" &&
    agentType !== constants.AttemptTodoCompletionAgentName;

  return (
    <NewTaskToolView
      {...props}
      taskSource={taskSource}
      uid={uid}
      toolCallStatusRegistryRef={subTaskToolCallStatusRegistry}
      onMoveToBackground={
        canMoveToBackground
          ? () => {
              void taskSource?.moveToBackground().catch(() => undefined);
            }
          : undefined
      }
    />
  );
}

export interface NewTaskToolViewProps extends ToolProps<"newTask"> {
  taskSource?: (TaskThreadSource & { parentId?: string }) | undefined;
  uid: string | undefined;
  toolCallStatusRegistryRef?: RefObject<ToolCallStatusRegistry>;
  onMoveToBackground?: () => void;
}

function NewTaskToolView(props: NewTaskToolViewProps) {
  const {
    tool,
    isExecuting,
    taskSource,
    uid,
    toolCallStatusRegistryRef,
    onMoveToBackground,
  } = props;
  const { t } = useTranslation();
  const store = useDefaultStore();
  const navigate = useNavigate();
  const agent = tool.input?.agentType;
  const description = tool.input?.description ?? "";
  const agentType = tool.input?.agentType;
  const toolTitle = agentType?.trim() || "Subtask";
  const completed =
    tool.state === "output-available" &&
    "result" in tool.output &&
    hasNewTaskResult(tool.output.result);
  const [showMessageList, setShowMessageList, setShowMessageListImmediately] =
    useShowMessageList();
  const throttledTaskSource = useThrottle(taskSource, SubtaskPreviewThrottleMs);
  const previewSource = isExecuting ? throttledTaskSource : taskSource;
  const taskThreadSource = useMemo(() => {
    if (!previewSource) {
      return undefined;
    }
    return { ...previewSource, isLoading: false };
  }, [previewSource]);

  // Collapse when execution completes
  const wasCompleted = useRef(completed);
  useEffect(() => {
    if (!wasCompleted.current && !isExecuting && completed) {
      setShowMessageList(false);
    }
  }, [isExecuting, completed, setShowMessageList]);

  const expandableDetail = useMemo(() => {
    return taskThreadSource && taskThreadSource.messages.length > 1 ? (
      <FixedStateChatContextProvider
        toolCallStatusRegistry={toolCallStatusRegistryRef?.current}
      >
        <TaskThread
          source={taskThreadSource}
          showMessageList={showMessageList}
          assistant={{ name: agent?.trim() || "Pochi" }}
        />
      </FixedStateChatContextProvider>
    ) : undefined;
  }, [agent, showMessageList, taskThreadSource, toolCallStatusRegistryRef]);

  const isBackground =
    tool.state === "output-available" && !!tool.output.backgroundJobId;

  if (agentType === "browser") {
    return <BrowserView {...props} taskSource={previewSource} />;
  }

  if (agentType === "planner" && !isBackground) {
    return <PlannerView {...props} taskSource={previewSource} />;
  }

  if (agentType === "attemptTodoCompletion") {
    return <AttemptTodoCompletionView {...props} taskSource={previewSource} />;
  }

  const title = (
    <div className="flex min-w-0 items-start gap-2">
      {isBackground && uid ? (
        <BackgroundSubagentStatusIcon taskId={uid} tool={tool} />
      ) : (
        <StatusIcon
          tool={tool}
          isExecuting={isExecuting}
          className="flex h-5 shrink-0 items-center self-start leading-none"
        />
      )}
      <div
        className={cn(
          "min-w-0 flex-1 text-muted-foreground leading-5",
          isBackground
            ? "flex items-center gap-2 overflow-hidden whitespace-nowrap"
            : "break-words",
        )}
      >
        <Badge
          variant="secondary"
          className={cn(
            "inline-flex h-5 shrink-0 py-0 align-top",
            !isBackground && "mr-2",
          )}
        >
          {uid && isBackground && isVSCodeEnvironment() ? (
            <BackgroundTaskButton taskId={uid}>
              {toolTitle}
            </BackgroundTaskButton>
          ) : uid && taskSource?.parentId && isVSCodeEnvironment() ? (
            <span
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
              className="cursor-pointer hover:underline"
            >
              {toolTitle}
            </span>
          ) : (
            <>{toolTitle}</>
          )}
        </Badge>
        {description && (
          <span
            className={
              isBackground ? "min-w-0 truncate" : "break-words align-top"
            }
            title={isBackground ? description : undefined}
          >
            {description}
          </span>
        )}
      </div>
      {onMoveToBackground && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0 self-start text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onMoveToBackground();
              }}
            >
              <SendToBack className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-60">
            <p className="font-medium">
              {t("backgroundTasks.moveToBackground")}
            </p>
            <p className="text-muted-foreground">
              {t("backgroundTasks.moveToBackgroundHint")}
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  return (
    <ExpandableToolContainer
      title={title}
      expandIconClassName="mt-0"
      expandableDetail={expandableDetail}
      detail={
        isBackground ? undefined : (
          <TodoDetail todos={taskSource?.todos ?? []} />
        )
      }
      expanded={showMessageList}
      onToggle={setShowMessageListImmediately}
    />
  );
}

function useShowMessageList() {
  const isVSCode = isVSCodeEnvironment();
  return useDebounceState(false, 1_500, {
    leading: !isVSCode,
  });
}
