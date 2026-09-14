import type { UseChatHelpers } from "@ai-sdk/react";
import { prompts } from "@getpochi/common";
import {
  isAssistantMessageWithStreamingParts,
  prepareLastMessageForRetry,
} from "@getpochi/common/message-utils";
import type { Message } from "@getpochi/livekit";
import { useCallback } from "react";
import { ReadyForRetryError } from "./use-ready-for-retry-error";

export function useRetry({
  messages,
  setMessages,
  sendMessage,
  regenerate,
  clearFileStateCache,
}: Pick<
  UseChatHelpers<Message>,
  "messages" | "sendMessage" | "regenerate" | "setMessages"
> & {
  clearFileStateCache?: () => void | Promise<void>;
}) {
  const retryRequest = useCallback(
    async (error: Error) => {
      if (messages.length === 0) {
        return;
      }

      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role !== "assistant") {
        return sendMessage(undefined);
      }

      const lastMessageForRetry = await prepareLastMessageForRetry(
        lastMessage,
        clearFileStateCache,
      );
      if (lastMessageForRetry != null) {
        setMessages([...messages.slice(0, -1), lastMessageForRetry]);
        if (
          error instanceof ReadyForRetryError &&
          error.kind === "content-filter"
        ) {
          return sendMessage(undefined);
        }
        // A real error can override no-tool-calls; inspect the retained response.
        if (isAssistantMessageWithStreamingParts(lastMessageForRetry)) {
          return sendMessage({
            text: prompts.createSystemReminder(
              prompts.incompleteResponseReminder,
            ),
          });
        }
        if (
          error instanceof ReadyForRetryError &&
          error.kind === "no-tool-calls"
        ) {
          return sendMessage({
            text: prompts.createSystemReminder(prompts.toolCallsReminder),
          });
        }
        return sendMessage(undefined);
      }

      return regenerate({
        messageId: lastMessage.id,
      });
    },
    [messages, setMessages, sendMessage, regenerate, clearFileStateCache],
  );

  return retryRequest;
}
