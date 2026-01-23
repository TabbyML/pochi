import { useSubtaskOffhand } from "@/features/settings";
import { useLatest } from "@/lib/hooks/use-latest";
import type { Message } from "@getpochi/livekit";
import { useCallback } from "react";

export function useShouldStopAutoApprove() {
  const { subtaskOffhand } = useSubtaskOffhand();
  const offhand = useLatest(subtaskOffhand);

  return useCallback(
    ({ messages }: { messages: Message[] }) => {
      const lastToolPart = messages.at(-1)?.parts.at(-1);
      return (
        offhand.current &&
        lastToolPart?.type === "tool-newTask" &&
        lastToolPart?.input?.agentType === "planner" &&
        lastToolPart?.state === "output-available"
      );
    },
    [offhand],
  );
}
