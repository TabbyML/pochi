import type { Message } from "@getpochi/livekit";

export function shouldStopAutoApprove({ messages }: { messages: Message[] }) {
  const lastToolPart = messages.at(-1)?.parts.at(-1);

  return (
    lastToolPart?.type === "tool-newTask" &&
    lastToolPart?.input?.agentType === "planner" &&
    lastToolPart?.state === "output-available"
  );
}
