import { useMixinReadyForRetryError, useRetry } from "@/features/retry";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";
import { useCallback } from "react";
import { usePendingApproval } from "./use-pending-approval";

type MaybePromise<T> = T | Promise<T>;

export function useApprovalAndRetry({
  error,
  messages,
  setMessages,
  status,
  regenerate,
  sendMessage,
  showApproval,
  isSubTask,
  prepareLastMessageForRetry,
}: {
  showApproval: boolean;
  isSubTask: boolean;
  prepareLastMessageForRetry?: (
    message: Message,
  ) => MaybePromise<Message | undefined>;
} & Pick<
  UseChatHelpers<Message>,
  "error" | "messages" | "sendMessage" | "regenerate" | "status" | "setMessages"
>) {
  const { pendingApproval, increaseRetryCount } = usePendingApproval({
    error: useMixinReadyForRetryError(messages, error),
    messages,
    status,
    isSubTask,
  });

  const retryImpl = useRetry({
    messages,
    setMessages,
    sendMessage,
    regenerate,
    prepareLastMessageForRetry,
  });

  const retry = useCallback(
    (error: Error) => {
      increaseRetryCount();
      retryImpl(error);
    },
    [retryImpl, increaseRetryCount],
  );

  if (!showApproval) {
    return {
      pendingApproval: undefined,
      retry: () => {},
    };
  }

  return { pendingApproval, retry };
}
