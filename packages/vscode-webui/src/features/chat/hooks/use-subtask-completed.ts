import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { useCallback, useEffect, useState } from "react";
import { extractCompletionResult } from "../lib/tool-call-life-cycle";

// Detect if subtask is completed (in subtask)
export const useSubtaskCompleted = (
  isSubTask: boolean,
  messages: Message[],
) => {
  const [taskCompleted, setTaskCompleted] = useState(false);
  useEffect(() => {
    if (!isSubTask || taskCompleted) return;
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
  });

  return taskCompleted;
};

// Complete subtask by adding tool result (in parent task)
export const useCompleteSubtask = ({
  completedSubtaskUid,
  addToolResult,
  messages,
}: { completedSubtaskUid?: string } & Pick<
  UseChatHelpers<Message>,
  "addToolResult" | "messages"
>) => {
  const { store } = useStore();

  const completeSubtask = useCallback(
    (subtaskUid: string) => {
      const toolPart = messages
        .flatMap((m) => m.parts)
        .find(
          (part) =>
            part.type === "tool-newTask" &&
            part.input?._meta?.uid === subtaskUid &&
            part.state === "input-available",
        );
      try {
        const result = extractCompletionResult(store, subtaskUid);
        if (toolPart && result) {
          addToolResult({
            tool: "newTask",
            // @ts-ignore
            toolCallId: toolPart.toolCallId,
            output: { result },
          });
        }
      } catch (error) {}
    },
    [addToolResult, messages, store],
  );

  useEffect(() => {
    if (completedSubtaskUid) {
      completeSubtask(completedSubtaskUid);
    }
  }, [completedSubtaskUid, completeSubtask]);
};
