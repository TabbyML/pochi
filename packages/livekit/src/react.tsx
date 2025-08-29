import { Chat } from "@ai-sdk/react";
import { useStore } from "@livestore/react";
import { useMemo } from "react";
import { LiveChatKit, type LiveChatKitOptions } from "./chat/live-chat-kit";
import type { Message } from "./types";

export function useLiveChatKit(
  props: Omit<
    LiveChatKitOptions<Chat<Message>>,
    "store" | "chatClass" | "isCli"
  >,
) {
  const { store } = useStore();
  // biome-ignore lint/correctness/useExhaustiveDependencies: create new kit on taskId change.
  return useMemo(
    () => new LiveChatKit({ ...props, store, isCli: false, chatClass: Chat }),
    [store.storeId, props.taskId],
  );
}
