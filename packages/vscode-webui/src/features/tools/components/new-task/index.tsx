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
import { useNavigate } from "@tanstack/react-router";
import { type RefObject, useEffect, useRef } from "react";
import { useInlinedSubTask } from "../../hooks/use-inlined-sub-task";

import { useLiveSubTask } from "../../hooks/use-live-sub-task";
import { StatusIcon } from "../status-icon";
import { ExpandIcon, ToolTitle } from "../tool-container";
import type { ToolProps } from "../types";
import { BrowserView } from "./browser-view";
import { PlannerView } from "./planner-view";

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
        <div className="flex min-w-0 items-center gap-2">
          <StatusIcon tool={tool} isExecuting={isExecuting} />
          <Badge variant="secondary" className={cn("my-0.5 py-0")}>
            {toolTitle}
          </Badge>
          {description && (
            <span className="min-w-0 text-muted-foreground">{description}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={openInTab}
          disabled={!canOpen}
        >
          {"ASYNC"}
        </Button>
      </ToolTitle>
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

export interface NewTaskToolViewProps extends ToolProps<"newTask"> {
  taskSource?: (TaskThreadSource & { parentId?: string }) | undefined;
  uid: string | undefined;
  toolCallStatusRegistryRef?: RefObject<ToolCallStatusRegistry>;
}

function NewTaskToolView(props: NewTaskToolViewProps) {
  const { tool, isExecuting, taskSource, uid, toolCallStatusRegistryRef } =
    props;
  const store = useDefaultStore();
  const navigate = useNavigate();
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

  if (agentType === "browser") {
    return <BrowserView {...props} />;
  }

  if (agentType === "planner") {
    return <PlannerView {...props} />;
  }

  return (
    <div>
      <ToolTitle>
        <div className="flex min-w-0 items-center gap-2">
          <StatusIcon tool={tool} isExecuting={isExecuting} />
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
            <span className="min-w-0 text-muted-foreground">{description}</span>
          )}
        </div>
        {taskSource && taskSource.messages.length > 1 && (
          <ExpandIcon
            className="cursor-pointer"
            isExpanded={showMessageList}
            onClick={() => setShowMessageListImmediately(!showMessageList)}
          />
        )}
      </ToolTitle>
      {taskSource && taskSource.messages.length > 1 && (
        <div className="mt-1 pl-6">
          <FixedStateChatContextProvider
            toolCallStatusRegistry={toolCallStatusRegistryRef?.current}
          >
            <TaskThread
              source={{ ...taskSource, isLoading: false }}
              showMessageList={showMessageList}
              assistant={{ name: agent ?? "Pochi" }}
            />
          </FixedStateChatContextProvider>
        </div>
      )}
    </div>
  );
}

function useShowMessageList(completed: boolean) {
  return useDebounceState(!completed, 1_500, {
    leading: !isVSCodeEnvironment(),
  });
}
