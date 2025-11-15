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
}: Pick<
  UseChatHelpers<Message>,
  "messages" | "sendMessage" | "regenerate" | "setMessages"
>) {
  const retryRequest = useCallback(
    async (error: Error) => {
      if (messages.length === 0) {
        return;
      }

      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role !== "assistant") {
        return sendMessage(undefined);
      }

      if (
        error instanceof ReadyForRetryError &&
        error.kind === "no-tool-calls"
      ) {
        return sendMessage({
          text: prompts.createSystemReminder(
            "You should use tool calls to answer the question, for example, use attemptCompletion if the job is done, or use askFollowupQuestions to clarify the request.",
          ),
        });
      }

      const lastMessageForRetry = prepareLastMessageForRetry(lastMessage);
      if (lastMessageForRetry != null) {
        setMessages([...messages.slice(0, -1), lastMessageForRetry]);
        return sendMessage(undefined);
      }

      return regenerate({
        messageId: lastMessage.id,
      });
    },
    [messages, setMessages, sendMessage, regenerate],
  );

  return retryRequest;
}
