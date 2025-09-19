import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { useCallback, useEffect, useState } from "react";
import { useAutoApproveGuard } from "../lib/chat-state";
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
  addToolResult,
  messages,
}: Pick<UseChatHelpers<Message>, "addToolResult" | "messages">) => {
  const { store } = useStore();
  const autoApproveGuard = useAutoApproveGuard();

  const addSubtaskResult = useCallback(
    (subtaskUid: string, toolCallId: string) => {
      try {
        const result = extractCompletionResult(store, subtaskUid);
        if (result) {
          addToolResult({
            tool: "newTask",
            toolCallId: toolCallId,
            output: { result },
          }).then(() => {
            autoApproveGuard.current = "auto";
          });
        }
      } catch (error) {}
    },
    [addToolResult, store, autoApproveGuard],
  );

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
    addSubtaskResult(subtaskUid, toolPart.toolCallId);
  }, [addSubtaskResult, messages]);
};
