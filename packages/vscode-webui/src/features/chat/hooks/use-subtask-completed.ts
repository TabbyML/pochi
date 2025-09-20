import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { getToolName } from "ai";
import { useEffect, useState } from "react";
import { useAutoApproveGuard, useToolCallLifeCycle } from "../lib/chat-state";
import { extractCompletionResult } from "../lib/tool-call-life-cycle";
import type { SubtaskInfo } from "./use-subtask-info";

// Detect if subtask is completed (in subtask)
export const useSubtaskCompleted = (
  subtaskInfo: SubtaskInfo | undefined,
  messages: Message[],
) => {
  const [taskCompleted, setTaskCompleted] = useState(false);
  useEffect(() => {
    if (!subtaskInfo || !subtaskInfo.manualRun || taskCompleted) return;
    const lastMessage = messages.at(-1);
    if (!lastMessage) return;
    for (const part of lastMessage.parts) {
      if (
        part.type === "tool-attemptCompletion" &&
        part.state === "input-available"
      ) {
        setTaskCompleted(true);
      }
    }
  }, [subtaskInfo, messages, taskCompleted]);

  return taskCompleted;
};

// Complete subtask by adding tool result (in parent task)
export const useAddSubtaskResult = ({
  messages,
}: Pick<UseChatHelpers<Message>, "messages">) => {
  const autoApproveGuard = useAutoApproveGuard();
  const { store } = useStore();
  const { getToolCallLifeCycle, previewingToolCalls } = useToolCallLifeCycle();

  // biome-ignore lint/correctness/useExhaustiveDependencies(previewingToolCalls): watch for previewingToolCalls
  useEffect(() => {
    const toolPart = messages.at(-1)?.parts.at(-1);
    if (
      !toolPart ||
      toolPart.type !== "tool-newTask" ||
      toolPart.state !== "input-available"
    ) {
      return;
    }
    const subtaskUid = toolPart.input?._meta?.uid;
    if (!subtaskUid) return;
    const lifecycle = getToolCallLifeCycle({
      toolName: getToolName(toolPart),
      toolCallId: toolPart.toolCallId,
    });
    if (lifecycle.status === "ready") {
      autoApproveGuard.current = "auto";
      lifecycle.addResult(extractCompletionResult(store, subtaskUid));
    }
  }, [
    autoApproveGuard,
    previewingToolCalls,
    messages,
    getToolCallLifeCycle,
    store,
  ]);
};
