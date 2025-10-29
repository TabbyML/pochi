import type React from "react";
import { useCallback, useEffect, useMemo } from "react"; // useMemo is now in the hook
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useAutoApproveGuard, useToolCallLifeCycle } from "@/features/chat";
import {
  useSelectedModels,
  useSubtaskOffhand,
  useToolAutoApproval,
} from "@/features/settings";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useNavigate } from "@tanstack/react-router";
import { getToolName } from "ai";
import type { PendingToolCallApproval } from "../hooks/use-pending-tool-call-approval";

interface ToolCallApprovalButtonProps {
  pendingApproval: PendingToolCallApproval;
  isSubTask: boolean;
}

// Component
export const ToolCallApprovalButton: React.FC<ToolCallApprovalButtonProps> = ({
  pendingApproval,
  isSubTask,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const autoApproveGuard = useAutoApproveGuard();
  const { getToolCallLifeCycle } = useToolCallLifeCycle();
  const { selectedModel } = useSelectedModels();
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

  const manualRunSubtask = useCallback(
    (subtaskUid: string) => {
      navigate({
        to: "/task",
        search: {
          uid: subtaskUid,
        },
      });
    },
    [navigate],
  );

  const { subtaskOffhand } = useSubtaskOffhand();
  const onAccept = useCallback(() => {
    autoApproveGuard.current = "auto";
    for (const [i, lifecycle] of lifecycles.entries()) {
      if (lifecycle.status !== "ready") {
        continue;
      }

      if (lifecycle.toolName === "newTask" && subtaskOffhand === false) {
        const newTaskInput =
          pendingApproval.name === "newTask" &&
          pendingApproval.tool.type === "tool-newTask"
            ? pendingApproval.tool.input
            : undefined;
        const subtaskUid = newTaskInput?._meta?.uid;
        if (subtaskUid) {
          manualRunSubtask(subtaskUid);
        }
        return;
      }
      lifecycle.execute(tools[i].input, {
        contentType: selectedModel?.contentType,
      });
    }
  }, [
    tools,
    lifecycles,
    autoApproveGuard,
    manualRunSubtask,
    pendingApproval,
    subtaskOffhand,
    selectedModel,
  ]);

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
