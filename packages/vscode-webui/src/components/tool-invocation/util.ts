import type { Message } from "@getpochi/livekit";

export const getBackgroundJobCommandFromMessages = (
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
