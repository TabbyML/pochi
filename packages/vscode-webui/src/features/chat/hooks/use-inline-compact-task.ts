import type { UseChatHelpers } from "@ai-sdk/react";
import { prompts } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { useState } from "react";

export const useInlineCompactTask = ({
  sendMessage,
}: {} & Pick<UseChatHelpers<Message>, "sendMessage">) => {
  const [isPending, setIsPending] = useState(false);
  const inlineCompactTask = async () => {
    if (isPending) {
      return;
    }
    setIsPending(true);
    try {
      await sendMessage({
        text: prompts.createSystemReminder(
          "The task has been summarized. Please analyze the current status, then use askFollowupQuestion to confirm the next steps with the user.",
        ),
        metadata: {
          kind: "user",
          compact: true,
        },
      });
    } finally {
      setIsPending(false);
    }
  };

  return { inlineCompactTaskPending: isPending, inlineCompactTask };
};
