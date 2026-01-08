import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Badge } from "@/components/ui/badge";
import {
  FixedStateChatContextProvider,
  ToolCallStatusRegistry,
} from "@/features/chat";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment } from "@/lib/vscode";
import { Link } from "@tanstack/react-router";
import { type RefObject, useEffect, useRef } from "react";
import { useInlinedSubTask } from "../../hooks/use-inlined-sub-task";
import { useLiveSubTask } from "../../hooks/use-live-sub-task";
import { StatusIcon } from "../status-icon";
import { ExpandIcon, ToolTitle } from "../tool-container";
import type { ToolProps } from "../types";

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
    </div>
  );
}

function useShowMessageList(completed: boolean) {
  return useDebounceState(!completed, 1_500, {
    leading: !isVSCodeEnvironment(),
  });
}
