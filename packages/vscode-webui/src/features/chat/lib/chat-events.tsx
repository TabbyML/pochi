import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";
import Emittery, { type UnsubscribeFunction } from "emittery";
import { useCallback, useEffect } from "react";

interface SendMessagePayload {
  prompt: string;
}

const emitter = new Emittery<{
  sendMessage: SendMessagePayload;
  sendRetry: null;
}>();

export function useSendMessage() {
  const sendMessage = useCallback((payload: SendMessagePayload) => {
    emitter.emit("sendMessage", payload);
  }, []);

  return sendMessage;
}

export function useSendRetry() {
  const sendRetry = useCallback(() => {
    emitter.emit("sendRetry", null);
  }, []);

  return sendRetry;
}

export function useHandleChatEvents({
  sendMessage,
  sendRetry,
}: {
  sendMessage?: UseChatHelpers<Message>["sendMessage"];
  sendRetry?: () => void;
}) {
  useEffect(() => {
    const unsubscribes: UnsubscribeFunction[] = [];

    if (sendMessage) {
      unsubscribes.push(
        emitter.on("sendMessage", async (payload) => {
          sendMessage({
            text: payload.prompt,
          });
        }),
      );
    }
    if (sendRetry) {
      unsubscribes.push(
        emitter.on("sendRetry", async () => {
          sendRetry();
        }),
      );
    }

    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  }, [sendMessage, sendRetry]);
}
