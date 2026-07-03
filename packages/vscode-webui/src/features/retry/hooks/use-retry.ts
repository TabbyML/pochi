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

      if (
        error instanceof ReadyForRetryError &&
        error.kind === "no-tool-calls"
      ) {
        return sendMessage({
          text: prompts.createSystemReminder(prompts.toolCallsReminder),
        });
      }

      const lastMessageForRetry = await prepareLastMessageForRetry(
        lastMessage,
        clearFileStateCache,
      );
      if (lastMessageForRetry != null) {
        setMessages([...messages.slice(0, -1), lastMessageForRetry]);
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
