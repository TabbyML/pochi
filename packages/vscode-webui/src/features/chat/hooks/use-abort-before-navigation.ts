import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

export function useAbortBeforeNavigation(abortController: AbortController) {
  const router = useRouter();
  useEffect(() => {
    // Subscribe to the 'onBeforeLoad' event
    const unsubscribe = router.subscribe("onBeforeLoad", () => {
      abortController.abort();
    });

    // Clean up the subscription when the component unmounts
    return () => {
      unsubscribe();
    };
  }, [abortController, router]);
}
