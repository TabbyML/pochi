import { useEffect, useRef } from "react";

import { useAutoApproveGuard } from "@/features/chat";
import type { Task } from "@getpochi/livekit";
import { ReadyForRetryError } from "./use-ready-for-retry-error";

interface UseEventAutoStartOptions {
  task?: Task;
  retry: (error: Error) => void;
  enabled: boolean;
}

export const usePendingModelAutoStart = ({
  task,
  retry,
  enabled,
}: UseEventAutoStartOptions) => {
  const init = task?.status === "pending-model";
  const autoApproveGuard = useAutoApproveGuard();

  const initStarted = useRef(false);
  useEffect(() => {
    if (enabled && init && !initStarted.current) {
      initStarted.current = true;
      autoApproveGuard.current = "auto";
      retry(new ReadyForRetryError("ready"));
    }
  }, [init, retry, enabled, autoApproveGuard]);
};
