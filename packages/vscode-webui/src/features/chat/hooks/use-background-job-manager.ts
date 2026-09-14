import { useBackgroundCommands } from "@/lib/hooks/use-background-commands";
import { useDefaultStore } from "@/lib/use-default-store";
import { BackgroundJobManager } from "@getpochi/livekit";
import { useMemo } from "react";

export function useBackgroundJobManager(taskId: string) {
  const store = useDefaultStore();
  const { close } = useBackgroundCommands();
  return useMemo(
    () =>
      new BackgroundJobManager({
        store,
        taskId,
        commands: {
          kill: async (id) => {
            if (!close)
              throw new Error(
                "Background command controller is not available.",
              );
            await close(id);
          },
        },
      }),
    [store, taskId, close],
  );
}
