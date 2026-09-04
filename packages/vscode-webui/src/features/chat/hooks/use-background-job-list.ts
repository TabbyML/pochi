import { useBackgroundCommands } from "@/lib/hooks/use-background-commands";
import { useBackgroundJobNotifications } from "@/lib/hooks/use-background-job-notifications";
import type { Message } from "@getpochi/livekit";
import { useMemo } from "react";
import {
  type BackgroundJobEntry,
  buildBackgroundJobList,
} from "../lib/build-background-job-list";

/** @useSignals */
export function useBackgroundJobList(
  taskId: string,
  messages: Message[],
): BackgroundJobEntry[] {
  const { backgroundCommands } = useBackgroundCommands();
  const { notifications } = useBackgroundJobNotifications(taskId);

  return useMemo(
    () =>
      buildBackgroundJobList({ messages, notifications, backgroundCommands }),
    [messages, notifications, backgroundCommands],
  );
}
