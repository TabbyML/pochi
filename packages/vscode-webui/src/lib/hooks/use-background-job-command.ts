import type { Message } from "@getpochi/livekit";
import { useMemo } from "react";

const getBackgroundJobCommandFromMessages = (
  messages: Message[],
  backgroundJobId: string,
): string | undefined => {
  const parts = messages.flatMap((msg) => msg.parts);

  for (const part of parts) {
    if (part.type === "tool-startBackgroundJob") {
      if (part.output?.backgroundJobId === backgroundJobId) {
        return part.input?.command;
      }
    }
  }
};

export const useBackgroundJobCommand = (
  messages: Message[],
  backgroundJobId?: string,
): string | undefined => {
  if (!backgroundJobId) return;

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  return useMemo(() => {
    return (
      getBackgroundJobCommandFromMessages(messages, backgroundJobId) ??
      `Job id: ${backgroundJobId}`
    );
  }, [backgroundJobId]);
};
