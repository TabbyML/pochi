import { useBackgroundJobNotifications } from "@/lib/hooks/use-background-job-notifications";
import { useVisibleTerminals } from "@/lib/hooks/use-visible-terminals";
import type { Message } from "@getpochi/livekit";
import { useMemo } from "react";
import { type JobList, buildJobList } from "../lib/build-job-list";

/**
 * The background work of this task.
 */
/** @useSignals */
export function useJobList(taskId: string, messages: Message[]): JobList {
  const { terminals } = useVisibleTerminals();
  const { notifications } = useBackgroundJobNotifications(taskId);

  return useMemo(
    () => buildJobList({ messages, notifications, terminals }),
    [messages, notifications, terminals],
  );
}
