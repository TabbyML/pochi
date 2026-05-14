import { TaskThread, type TaskThreadSource } from "@/components/task-thread";
import { Badge } from "@/components/ui/badge";
import {
  FixedStateChatContextProvider,
  ToolCallStatusRegistry,
} from "@/features/chat";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useNavigate } from "@/lib/hooks/use-navigate";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment } from "@/lib/vscode";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { useThrottle } from "react-use";
import { useInlinedSubTask } from "../../hooks/use-inlined-sub-task";
import { useLiveSubTask } from "../../hooks/use-live-sub-task";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";
import { BrowserView } from "./browser-view";
import { PlannerView } from "./planner-view";
import { WalkthroughView } from "./walkthrough-view";

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

  return (
    <NewTaskToolView
      {...props}
      taskSource={taskSource}
      uid={uid}
      toolCallStatusRegistryRef={subTaskToolCallStatusRegistry}
    />
  );
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
          assistant={{ name: agent ?? "Pochi" }}
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

  if (agentType === "walkthrough") {
    return <WalkthroughView {...props} taskSource={previewSource} />;
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
    </div>
  );

  return (
    <ExpandableToolContainer
      title={title}
      expandableDetail={expandableDetail}
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
