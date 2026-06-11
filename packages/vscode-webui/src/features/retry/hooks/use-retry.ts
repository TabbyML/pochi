import type { UseChatHelpers } from "@ai-sdk/react";
import { prompts } from "@getpochi/common";
import { prepareLastMessageForRetry } from "@getpochi/common/message-utils";
import type { Message } from "@getpochi/livekit";
import { useCallback } from "react";
import { ReadyForRetryError } from "./use-ready-for-retry-error";

export function useRetry({
  messages,
  setMessages,
  sendMessage,
  regenerate,
  clearFileStateCache,
  getHasActiveTodos,
  canRetry,
}: Pick<
  UseChatHelpers<Message>,
  "messages" | "sendMessage" | "regenerate" | "setMessages"
> & {
  clearFileStateCache?: () => Promise<void>;
  getHasActiveTodos?: () => boolean;
  canRetry?: () => boolean;
}) {
  const retryRequest = useCallback(
    async (error: Error) => {
      const shouldContinue = () => canRetry?.() ?? true;

      if (!shouldContinue()) {
        return;
      }

      if (messages.length === 0) {
        return;
      }

      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role !== "assistant") {
        if (!shouldContinue()) return;
        return sendMessage(undefined);
      }

      if (
        error instanceof ReadyForRetryError &&
        error.kind === "no-tool-calls"
      ) {
        const reminder = getHasActiveTodos?.()
          ? "You are working with an active todo and your previous response did not make progress with tools.\n\nContinue working toward the active todo using the available tools. After making progress and before ending the turn, call completeTodo so the current state can be audited."
          : "You should use tool calls to answer the question, for example, use attemptCompletion if the job is done, or use askFollowupQuestion to clarify the request.";

        if (!shouldContinue()) return;
        return sendMessage({
          text: prompts.createSystemReminder(reminder),
        });
      }

      const lastMessageForRetry = prepareLastMessageForRetry(lastMessage);
      if (lastMessageForRetry != null) {
        if (clearFileStateCache) {
          await clearFileStateCache();
        }
        if (!shouldContinue()) return;
        setMessages([...messages.slice(0, -1), lastMessageForRetry]);
        return sendMessage(undefined);
      }

      if (!shouldContinue()) return;
      return regenerate({
        messageId: lastMessage.id,
      });
    },
    [
      messages,
      setMessages,
      sendMessage,
      regenerate,
      clearFileStateCache,
      getHasActiveTodos,
      canRetry,
    ],
  );

  return retryRequest;
}
