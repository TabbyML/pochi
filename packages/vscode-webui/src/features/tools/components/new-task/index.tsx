import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FixedStateChatContextProvider,
  ToolCallStatusRegistry,
  useToolCallLifeCycle,
} from "@/features/chat";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useNavigate } from "@/lib/hooks/use-navigate";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import {
  constants,
  createBackgroundSubAgentStartedResult,
} from "@getpochi/common";
import { catalog, restartBackgroundTask } from "@getpochi/livekit";
import { getStaticToolName } from "ai";
import { PictureInPicture2 } from "lucide-react";
import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useThrottle } from "react-use";
import { useInlinedSubTask } from "../../hooks/use-inlined-sub-task";
import { useLiveSubTask } from "../../hooks/use-live-sub-task";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";
import { AttemptTodoCompletionView } from "./attempt-todo-completion-view";
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

  const store = useDefaultStore();
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
    !tool.input?.runInBackground &&
    agentType !== "browser" &&
    agentType !== constants.AttemptTodoCompletionAgentName;

  const onMoveToBackground = useCallback(async () => {
    if (!parentId) return;
    // Record the subagent state before handing off, so the TaskExecutor can
    // resolve the agent when it picks the task up.
    const { setBackgroundTaskState } =
      await vscodeHost.readBackgroundTaskState(uid);
    await setBackgroundTaskState({
      parentTaskId: parentId,
      useCase: "subagent",
      agentType,
    });
    // Settle the parent tool call as finished; this aborts the foreground
    // loop driving the subtask.
    lifecycle.detach({
      result: createBackgroundSubAgentStartedResult(uid),
      backgroundTaskId: uid,
    });
    // The aborted loop marks the task failed asynchronously; wait for it to
    // settle before flipping it to a runnable background task.
    await waitForTaskSettled(store, uid);
    store.commit(
      catalog.events.taskBackgrounded({ id: uid, updatedAt: new Date() }),
    );
    restartBackgroundTask(store, uid);
  }, [parentId, uid, agentType, lifecycle, store]);

  return (
    <NewTaskToolView
      {...props}
      taskSource={taskSource}
      uid={uid}
      toolCallStatusRegistryRef={subTaskToolCallStatusRegistry}
      onMoveToBackground={canMoveToBackground ? onMoveToBackground : undefined}
    />
  );
}

async function waitForTaskSettled(
  store: ReturnType<typeof useDefaultStore>,
  taskId: string,
) {
  for (let i = 0; i < 50; i++) {
    const task = store.query(catalog.queries.makeTaskQuery(taskId));
    if (
      task &&
      task.status !== "pending-model" &&
      task.status !== "pending-tool"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
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

  if (agentType === "browser") {
    return <BrowserView {...props} taskSource={previewSource} />;
  }

  if (agentType === "planner") {
    return <PlannerView {...props} taskSource={previewSource} />;
  }

  if (agentType === "attemptTodoCompletion") {
    return <AttemptTodoCompletionView {...props} taskSource={previewSource} />;
  }

  const title = (
    <div className="flex min-w-0 items-start gap-2">
      <StatusIcon
        tool={tool}
        isExecuting={isExecuting}
        className="mt-1 self-start leading-none"
      />
      <div className="min-w-0 flex-1 break-words text-muted-foreground leading-5">
        <Badge
          variant="secondary"
          className={cn("mr-2 inline-flex py-0 align-middle")}
        >
          {uid && taskSource?.parentId && isVSCodeEnvironment() ? (
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
          <span className="break-words align-middle">{description}</span>
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
              <PictureInPicture2 className="size-3.5" />
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
      expandableDetail={expandableDetail}
      detail={<TodoDetail todos={taskSource?.todos ?? []} />}
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
