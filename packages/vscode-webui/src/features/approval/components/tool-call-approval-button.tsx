import type React from "react";
import { useCallback, useEffect, useMemo } from "react"; // useMemo is now in the hook

import { Button } from "@/components/ui/button";
import { useAutoApproveGuard, useToolCallLifeCycle } from "@/features/chat";
import { useToolAutoApproval } from "@/features/settings";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import type { UITools } from "@getpochi/livekit";
import { useNavigate } from "@tanstack/react-router";
import { type ToolUIPart, getToolName } from "ai";
import type { PendingToolCallApproval } from "../hooks/use-pending-tool-call-approval";

interface ToolCallApprovalButtonProps {
  pendingApproval: PendingToolCallApproval;
  isSubTask: boolean;
}

type NewTaskTool = Extract<ToolUIPart<UITools>, { type: "tool-newTask" }>;

// Component
export const ToolCallApprovalButton: React.FC<ToolCallApprovalButtonProps> = ({
  pendingApproval,
  isSubTask,
}) => {
  const navigate = useNavigate();
  const autoApproveGuard = useAutoApproveGuard();
  const { getToolCallLifeCycle } = useToolCallLifeCycle();
  const [lifecycles, tools] = useMemo(
    () =>
      "tools" in pendingApproval
        ? [
            pendingApproval.tools.map((tool) =>
              getToolCallLifeCycle({
                toolName: getToolName(tool),
                toolCallId: tool.toolCallId,
              }),
            ),
            pendingApproval.tools,
          ]
        : [
            [
              getToolCallLifeCycle({
                toolName: getToolName(pendingApproval.tool),
                toolCallId: pendingApproval.tool.toolCallId,
              }),
            ],
            [pendingApproval.tool],
          ],
    [getToolCallLifeCycle, pendingApproval],
  );

  const ToolAcceptText: Record<string, string> = {
    writeToFile: "Save",
    executeCommand: "Run",
    todoWrite: "Continue",
    newTask: "Run",
  };

  const ToolRejectText: Record<string, string> = {
    todoWrite: "<disabled>",
  };

  const ToolAbortText: Record<string, string> = {};

  const acceptText = ToolAcceptText[pendingApproval.name] || "Accept";
  const rejectText = ToolRejectText[pendingApproval.name] || "Reject";
  const abortText = ToolAbortText[pendingApproval.name] || "Stop";

  const onAccept = useCallback(() => {
    autoApproveGuard.current = "auto";
    for (const [i, lifecycle] of lifecycles.entries()) {
      if (lifecycle.status !== "ready") {
        continue;
      }

      lifecycle.execute(tools[i].input);
    }
  }, [tools, lifecycles, autoApproveGuard]);

  const onReject = useCallback(() => {
    autoApproveGuard.current = "manual";
    for (const lifecycle of lifecycles) {
      if (lifecycle.status !== "ready") {
        continue;
      }
      lifecycle.reject();
    }
  }, [lifecycles, autoApproveGuard]);

  const isReady = lifecycles.every((x) => x.status === "ready");
  const isAutoApproved = useToolAutoApproval(
    pendingApproval,
    autoApproveGuard.current === "auto",
    isSubTask,
  );
  useEffect(() => {
    if (isReady && isAutoApproved) {
      onAccept();
    }
  }, [isReady, isAutoApproved, onAccept]);

  const [showAbort, setShowAbort, setShowAbortImmediate] = useDebounceState(
    false,
    1_000,
  ); // 1 seconds

  useEffect(() => {
    // Reset the abort button when the tool call changes
    pendingApproval;
    setShowAbortImmediate(false);
  }, [pendingApproval, setShowAbortImmediate]);

  const isExecuting = lifecycles.some((lifecycle) =>
    lifecycle.status.startsWith("execute"),
  );
  useEffect(() => {
    if (isExecuting) {
      setShowAbort(true);
    }
  }, [setShowAbort, isExecuting]);

  // biome-ignore lint/correctness/useExhaustiveDependencies(autoApproveGuard): autoApproveGuard is a ref, so it won't change
  const abort = useCallback(() => {
    autoApproveGuard.current = "stop";
    for (const lifecycle of lifecycles) {
      lifecycle.abort();
    }
  }, [lifecycles]);

  const showAccept = !isAutoApproved && isReady;
  const newTaskInput =
    pendingApproval.name === "newTask"
      ? (pendingApproval.tool as NewTaskTool).input
      : undefined;
  const newTaskUid = newTaskInput?._meta?.uid;

  const onManualRunSubtask = useCallback(() => {
    if (!newTaskUid || !newTaskInput) {
      return;
    }
    navigate({
      to: "/",
      search: {
        uid: newTaskUid,
        subtask: {
          agent: newTaskInput?.agentType,
          description: newTaskInput.description,
          manualRun: true,
        },
      },
    });
  }, [newTaskUid, newTaskInput, navigate]);

  if (showAccept) {
    return (
      <>
        <Button onClick={() => onAccept()}>{acceptText}</Button>
        {newTaskUid && (
          <Button onClick={onManualRunSubtask} variant="secondary">
            Manual Run
          </Button>
        )}
        {rejectText !== "<disabled>" && (
          <Button onClick={onReject} variant="secondary">
            {rejectText}
          </Button>
        )}
      </>
    );
  }

  if (showAbort && abortText && isExecuting) {
    /*
    Only display the abort button if:
    1. There's executing tool call
    2. The abort text is provided
    3. The showAbort flag is true (delayed for a bit to avoid flashing)
    */
    return <Button onClick={abort}>{abortText}</Button>;
  }

  return null;
};
