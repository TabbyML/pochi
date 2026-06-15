import type { UseChatHelpers } from "@ai-sdk/react";
import { prompts } from "@getpochi/common";
import { prepareLastMessageForRetry as defaultPrepareLastMessageForRetry } from "@getpochi/common/message-utils";
import type { Message } from "@getpochi/livekit";
import { useCallback } from "react";
import { ReadyForRetryError } from "./use-ready-for-retry-error";

type MaybePromise<T> = T | Promise<T>;

function prepareLastMessageForRetryDefault(message: Message) {
  return defaultPrepareLastMessageForRetry(message) as Message | undefined;
}

export function useRetry({
  messages,
  setMessages,
  sendMessage,
  regenerate,
  prepareLastMessageForRetry = prepareLastMessageForRetryDefault,
}: Pick<
  UseChatHelpers<Message>,
  "messages" | "sendMessage" | "regenerate" | "setMessages"
> & {
  prepareLastMessageForRetry?: (
    message: Message,
  ) => MaybePromise<Message | undefined>;
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
          text: prompts.createSystemReminder(
            "You should use tool calls to answer the question, for example, use attemptCompletion if the job is done, or use askFollowupQuestion to clarify the request.",
          ),
        });
      }

      const lastMessageForRetry = await prepareLastMessageForRetry(lastMessage);
      if (lastMessageForRetry != null) {
        setMessages([...messages.slice(0, -1), lastMessageForRetry]);
        return sendMessage(undefined);
      }

      return regenerate({
        messageId: lastMessage.id,
      });
    },
    [
      messages,
      setMessages,
      sendMessage,
      regenerate,
      prepareLastMessageForRetry,
    ],
  );

  return retryRequest;
}
