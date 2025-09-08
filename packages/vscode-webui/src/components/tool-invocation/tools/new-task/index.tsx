import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import {
  FixedStateChatContextProvider,
  ToolCallStatusRegistry,
} from "@/features/chat";
import { isVSCodeEnvironment } from "@/lib/vscode";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
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
  const description = tool.input?.description ?? "";

  let taskSource = taskThreadSource;

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

  const [showMessageList, setShowMessageList] = useState(false);
  return (
    <div>
      <ToolTitle>
        <span className={cn("flex items-center gap-2")}>
          <div>
            <StatusIcon tool={tool} isExecuting={isExecuting} />
            <Badge variant="secondary" className={cn("mr-1 ml-2 py-0")}>
              {uid && isVSCodeEnvironment() ? (
                <Link to="/" search={{ uid }} replace={true}>
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
            onClick={() => setShowMessageList(!showMessageList)}
          />
        )}
      </ToolTitle>
      {taskSource && (
        <FixedStateChatContextProvider
          toolCallStatusRegistry={subTaskToolCallStatusRegistry.current}
        >
          <TaskThread source={taskSource} showMessageList={showMessageList} />
        </FixedStateChatContextProvider>
      )}
    </div>
  );
};
