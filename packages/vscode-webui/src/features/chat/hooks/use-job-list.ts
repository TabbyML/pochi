import { useBackgroundCommands } from "@/lib/hooks/use-background-commands";
import { useBackgroundJobNotifications } from "@/lib/hooks/use-background-job-notifications";
import type { Message } from "@getpochi/livekit";
import { useMemo } from "react";
import { type JobList, buildJobList } from "../lib/build-job-list";

/** @useSignals */
export function useJobList(taskId: string, messages: Message[]): JobList {
  const { backgroundCommands } = useBackgroundCommands();
  const { notifications } = useBackgroundJobNotifications(taskId);

  return useMemo(
    () => buildJobList({ messages, notifications, backgroundCommands }),
    [messages, notifications, backgroundCommands],
  );
}
