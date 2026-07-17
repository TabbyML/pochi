import { getLogger } from "@getpochi/common";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

const logger = getLogger("useAbortBeforeNavigation");

export function useAbortBeforeNavigation(
  abortController: AbortController,
  taskId: string,
): void {
  const router = useRouter();
  useEffect(() => {
    const unsubscribe = router.subscribe("onBeforeLoad", (event) => {
      logger.warn("Router navigation requested chat abort", {
        abortOrigin: "router-navigation",
        taskId,
        signalAlreadyAborted: abortController.signal.aborted,
        fromPathname: event.fromLocation?.pathname,
        toPathname: event.toLocation.pathname,
        pathChanged: event.pathChanged,
        hrefChanged: event.hrefChanged,
        hashChanged: event.hashChanged,
      });
      abortController.abort();
    });

    return unsubscribe;
  }, [abortController, router, taskId]);
}
