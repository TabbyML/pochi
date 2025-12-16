import type { UseChatHelpers } from "@ai-sdk/react";
import type { Message } from "@getpochi/livekit";
import Emittery from "emittery";
import { useCallback, useEffect } from "react";

interface SendMessagePayload {
  prompt: string;
}

const emitter = new Emittery<{
  sendMessage: SendMessagePayload;
}>();

export function useSendMessage() {
  const sendMessage = useCallback((payload: SendMessagePayload) => {
    console.log("[ChatEvents] useSendMessage called with payload:", payload);
    emitter.emit("sendMessage", payload);
  }, []);

  return sendMessage;
}

export function useHandleChatEvents(
  sendMessage?: UseChatHelpers<Message>["sendMessage"],
) {
  useEffect(() => {
    console.log(
      "[ChatEvents] useHandleChatEvents called with sendMessage:",
      !!sendMessage,
    );
    if (!sendMessage) {
      console.log(
        "[ChatEvents] sendMessage is undefined, not setting up listener",
      );
      return;
    }

    const unsubscribe = emitter.on("sendMessage", async (payload) => {
      console.log("[ChatEvents] Event received, sending to chat:", payload);
      sendMessage({
        text: payload.prompt,
      });
    });

    return unsubscribe;
  }, [sendMessage]);
}
