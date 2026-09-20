import { Chat } from "@ai-sdk/react";
import { useEffect, useMemo } from "react";
import { LiveChatKit, type LiveChatKitOptions } from "./chat/live-chat-kit";
import type { Message } from "./types";

export function useLiveChatKit(
  props: Omit<LiveChatKitOptions<Chat<Message>>, "chatClass">,
) {
  const { store, blobStore, ...rest } = props;
  // biome-ignore lint/correctness/useExhaustiveDependencies: request getters and callbacks read reactive refs.
  const chatKit = useMemo(
    () =>
      new LiveChatKit({
        ...rest,
        store,
        blobStore,
        chatClass: Chat,
      }),
    [
      store,
      rest.taskId,
      rest.isSubTask,
      rest.enableAutoCompact,
      rest.taskMemory,
      rest.projectMemory,
      rest.customAgent,
      rest.attemptCompletionSchema,
    ],
  );

  useEffect(() => chatKit.subscribeBackgroundJobs(), [chatKit]);

  return chatKit;
}
