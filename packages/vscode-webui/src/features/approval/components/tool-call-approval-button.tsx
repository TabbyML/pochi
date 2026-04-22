import type React from "react";
import { useCallback, useEffect, useMemo } from "react"; // useMemo is now in the hook
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  type SubtaskInfo,
  useAutoApproveGuard,
  useBatchExecuteManager,
  useToolCallLifeCycle,
} from "@/features/chat";
import {
  useSelectedModels,
  useSubtaskOffhand,
  useToolAutoApproval,
} from "@/features/settings";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useNavigate } from "@/lib/hooks/use-navigate";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import type { BuiltinSubAgentInfo } from "@getpochi/common/vscode-webui-bridge";
import { getToolArgs } from "@getpochi/tools";
import { getStaticToolName, getToolName } from "ai";
import { createLifecycleToolCallAdapter } from "../../chat/lib/scheduled-tool-call-adapters";
import type { PendingToolCallApproval } from "../hooks/use-pending-tool-call-approval";

interface ToolCallApprovalButtonProps {
  pendingApproval: PendingToolCallApproval;
  isSubTask: boolean;
  taskId?: string;
  parentUid?: string;
  subtask?: SubtaskInfo;
}

// Component
export const ToolCallApprovalButton: React.FC<ToolCallApprovalButtonProps> = ({
  taskId,
  pendingApproval,
  isSubTask,
  parentUid,
  subtask,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const autoApproveGuard = useAutoApproveGuard();
  const { getToolCallLifeCycle } = useToolCallLifeCycle();
  const batchExecuteManager = useBatchExecuteManager();
  const { selectedModel } = useSelectedModels();
  const [lifecycles, tools] = useMemo(
    () =>
      "tools" in pendingApproval
        ? [
            pendingApproval.tools.map((tool) =>
              getToolCallLifeCycle({
                toolName: getStaticToolName(tool),
                toolCallId: tool.toolCallId,
              }),
            ),
            pendingApproval.tools,
          ]
        : [
            [
              getToolCallLifeCycle({
                toolName: getStaticToolName(pendingApproval.tool),
                toolCallId: pendingApproval.tool.toolCallId,
              }),
            ],
            [pendingApproval.tool],
          ],
    [getToolCallLifeCycle, pendingApproval],
  );

  const ToolAcceptText: Record<string, string> = {
    writeToFile: t("toolInvocation.save"),
    executeCommand: t("toolInvocation.run"),
    todoWrite: t("toolInvocation.continue"),
    newTask: t("toolInvocation.run"),
  };

  const ToolRejectText: Record<string, string> = {
    todoWrite: "<disabled>",
  };

  const ToolAbortText: Record<string, string> = {};

  const acceptText =
    ToolAcceptText[pendingApproval.name] || t("toolInvocation.accept");
  const rejectText =
    ToolRejectText[pendingApproval.name] || t("toolInvocation.reject");
  const abortText =
    ToolAbortText[pendingApproval.name] || t("toolInvocation.stop");

  const store = useDefaultStore();
  const { customAgent } = useCustomAgent(subtask?.agent);
  const builtinSubAgentInfo: BuiltinSubAgentInfo | undefined =
    isSubTask && subtask?.agent === "browser" && taskId
      ? { type: subtask.agent, sessionId: taskId }
      : isSubTask &&
          (subtask?.agent === "planner" || subtask?.agent === "explore")
        ? { type: subtask.agent }
        : undefined;
  const executeCommandWhitelist = getToolArgs(
    customAgent?.tools,
    "executeCommand",
  );

  const manualRunSubtask = useCallback(
    (subtaskUid: string) => {
      navigate({
        to: "/task",
        search: {
          uid: subtaskUid,
          storeId: store.storeId,
        },
      });
    },
    [navigate, store.storeId],
  );

  const { subtaskOffhand } = useSubtaskOffhand();
  const onAccept = useCallback(() => {
    autoApproveGuard.current = "auto";

    for (const [i, lifecycle] of lifecycles.entries()) {
      if (lifecycle.status !== "init") {
        continue;
      }

      const tool = tools[i];
      const runManually =
        (!subtaskOffhand &&
          // Async task cannot be run manually.
          !(tool.type === "tool-newTask" && tool.input?.runAsync)) ||
        // planner and guide agents always run manually
        (tool.type === "tool-newTask" &&
          (tool.input?.agentType === "planner" ||
            tool.input?.agentType === "guide"));
      if (tool.type === "tool-newTask" && runManually) {
        const subtaskUid = tool.input?._meta?.uid;
        if (subtaskUid) {
          // For non-async tasks, use manual navigation
          manualRunSubtask(subtaskUid);
        }
        return;
      }

      if (!taskId) {
        // taskId is required to enqueue
        continue;
      }

      // Enqueue into the batch manager instead of calling execute() directly
      batchExecuteManager.enqueue(
        taskId,
        createLifecycleToolCallAdapter({
          lifecycle,
          toolName: getToolName(tool),
          input: tool.input,
          executeOptions: {
            contentType: selectedModel?.contentType,
            builtinSubAgentInfo,
            executeCommandWhitelist,
            taskId,
          },
        }),
      );
    }

    const uid = parentUid || taskId;
    if (uid) {
      vscodeHost.onTaskRunning(uid);
    }

    if (taskId) {
      batchExecuteManager.processQueue(taskId);
    }
  }, [
    tools,
    lifecycles,
    autoApproveGuard,
    manualRunSubtask,
    subtaskOffhand,
    selectedModel,
    taskId,
    parentUid,
    builtinSubAgentInfo,
    executeCommandWhitelist,
    batchExecuteManager,
  ]);

  const onReject = useCallback(() => {
    autoApproveGuard.current = "manual";
    for (const lifecycle of lifecycles) {
      if (lifecycle.status !== "init") {
        continue;
      }
      lifecycle.reject();
    }
  }, [lifecycles, autoApproveGuard]);

  const isReady = lifecycles.every((x) => x.status === "init");
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
    if (!taskId) {
      return;
    }
    // batchExecuteManager.abort cancels both in-flight items (by calling each
    // item's cancel() adapter, which aborts the underlying lifecycle) and items
    // still waiting in the queue — no need to abort lifecycles directly here.
    batchExecuteManager.abort(taskId, "user-abort");
  }, [batchExecuteManager, taskId]);

  const showAccept = !isAutoApproved && isReady;

  if (showAccept) {
    return (
      <>
        <Button onClick={() => onAccept()}>{acceptText}</Button>
        {rejectText !== "<disabled>" && (
          <Button onClick={onReject} variant="secondary">
            {rejectText}
          </Button>
        )}
      </>
    );
  }

  if (showAbort && abortText && isExecuting) {
    // Delay the stop button slightly to avoid a flash for short-lived executions.
    return <Button onClick={abort}>{abortText}</Button>;
  }

  return null;
};
