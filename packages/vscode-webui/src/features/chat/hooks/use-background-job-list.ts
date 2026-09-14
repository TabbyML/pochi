import { useBackgroundCommands } from "@/lib/hooks/use-background-commands";
import { useBackgroundJobNotifications } from "@/lib/hooks/use-background-job-notifications";
import { useDefaultStore } from "@/lib/use-default-store";
import { type Message, catalog } from "@getpochi/livekit";
import type { BackgroundJobEntry } from "@getpochi/livekit";
import { useMemo } from "react";
import { useBackgroundJobManager } from "./use-background-job-manager";

/** @useSignals */
export function useBackgroundJobList(
  taskId: string,
  messages: Message[],
): BackgroundJobEntry[] {
  const store = useDefaultStore();
  const manager = useBackgroundJobManager(taskId);
  const subTasks = store.useQuery(catalog.queries.makeSubTaskQuery(taskId));
  const { backgroundCommands } = useBackgroundCommands();
  const { notifications } = useBackgroundJobNotifications(taskId);

  return useMemo(
    () =>
      manager.getJobs({
        messages,
        notifications,
        backgroundCommands,
        subTasks,
      }),
    [manager, messages, notifications, backgroundCommands, subTasks],
  );
}
