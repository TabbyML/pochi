import { Chat } from "@ai-sdk/react";
import { useMemo } from "react";
import { LiveChatKit, type LiveChatKitOptions } from "./chat/live-chat-kit";
import type { Message } from "./types";

export function useLiveChatKit(
  props: Omit<LiveChatKitOptions<Chat<Message>>, "chatClass" | "isCli">,
) {
  const { store, ...rest } = props;
  // biome-ignore lint/correctness/useExhaustiveDependencies: create new kit on taskId change.
  return useMemo(
    () => new LiveChatKit({ ...rest, store, isCli: false, chatClass: Chat }),
    [store.storeId, rest.taskId],
  );
}
