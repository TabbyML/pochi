import type { Message } from "@getpochi/livekit";
import { useMemo } from "react";
import { getReadyForRetryError } from "../utils/ready-for-retry-error";

export function useMixinReadyForRetryError(
  messages: Message[],
  error?: Error,
): Error | undefined {
  const readyForRetryError = useMemo(() => {
    return getReadyForRetryError(messages);
  }, [messages]);

  return error || readyForRetryError;
}
