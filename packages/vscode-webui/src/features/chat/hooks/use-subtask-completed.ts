import type { UseChatHelpers } from "@ai-sdk/react";
import { type Message, catalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { getToolName } from "ai";
import { useEffect, useMemo } from "react";
import { useAutoApproveGuard, useToolCallLifeCycle } from "../lib/chat-state";
import { extractCompletionResult } from "../lib/tool-call-life-cycle";
import type { SubtaskInfo } from "./use-subtask-info";

// Detect if subtask is completed (in subtask)
export const useShowCompleteSubtaskButton = (
  subtaskInfo: SubtaskInfo | undefined,
  messages: Message[],
) => {
  const { store } = useStore();
  const parentMessages = store
    .useQuery(catalog.queries.makeMessagesQuery(subtaskInfo?.parentUid ?? ""))
    .map((x) => x.data as Message);

  const isSubtaskToolCallCompleted = useMemo(() => {
    for (const message of parentMessages) {
      for (const part of message.parts) {
        if (
          part.type === "tool-newTask" &&
          part.input?._meta?.uid === subtaskInfo?.uid
        ) {
          return part.state === "output-available";
        }
      }
    }
    return false;
  }, [parentMessages, subtaskInfo]);

  const isSubtaskCompleted = useMemo(() => {
    const lastMessage = messages.at(-1);
    if (!lastMessage) return;
    for (const part of lastMessage.parts) {
      if (
        part.type === "tool-attemptCompletion" &&
        part.state === "input-available"
      ) {
        return true;
      }
    }
  }, [messages]);

  return isSubtaskCompleted && !isSubtaskToolCallCompleted;
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
      const result = extractCompletionResult(store, subtaskUid);
      if (result) {
        autoApproveGuard.current = "auto";
        lifecycle.addResult(result);
      }
    }
  }, [
    autoApproveGuard,
    previewingToolCalls,
    messages,
    getToolCallLifeCycle,
    store,
  ]);
};
