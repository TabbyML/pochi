import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  FixedStateChatContextProvider,
  ToolCallStatusRegistry,
} from "@/features/chat";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { isVSCodeEnvironment } from "@/lib/vscode";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { StatusIcon } from "../../status-icon";
import { ExpandIcon, ToolTitle } from "../../tool-container";
import type { ToolProps } from "../../types";
import { useInlinedSubTask } from "./use-inlined-sub-task";
import { useLiveSubTask } from "./use-live-sub-task";

interface NewTaskToolProps extends ToolProps<"newTask"> {
  // For storybook visualization
  taskThreadSource?: TaskThreadSource;
}

export const newTaskTool: React.FC<NewTaskToolProps> = ({
  tool,
  isExecuting,
  taskThreadSource,
}) => {
  const uid = tool.input?._meta?.uid;
  const agent = tool.input?.agentType;
  const description = tool.input?.description ?? "";

  let taskSource: (TaskThreadSource & { parentId?: string }) | undefined =
    taskThreadSource;

  const subTaskToolCallStatusRegistry = useRef(new ToolCallStatusRegistry());
  const inlinedTaskSource = useInlinedSubTask(tool);
  if (inlinedTaskSource) {
    taskSource = inlinedTaskSource;
  } else if (uid) {
    taskSource = useLiveSubTask(
      { tool, isExecuting },
      subTaskToolCallStatusRegistry.current,
    );
  }

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
                  to="/"
                  search={{
                    uid,
                    parentUid: taskSource.parentId,
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
          toolCallStatusRegistry={subTaskToolCallStatusRegistry.current}
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
};

function useShowMessageList(completed: boolean) {
  if (isVSCodeEnvironment()) {
    return useDebounceState(!completed, 1_500);
  }
  const [value, setValue] = useState(false);
  return [value, setValue, setValue] as const;
}
