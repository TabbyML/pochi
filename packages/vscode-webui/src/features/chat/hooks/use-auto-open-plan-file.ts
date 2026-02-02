import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { catalog } from "@getpochi/livekit";
import { useEffect, useRef } from "react";
import type { SubtaskInfo } from "./use-subtask-info";

/**
 * Options for the useAutoOpenPlanFile hook.
 */
interface UseAutoOpenPlanFileOptions {
  isSubTask: boolean;
  subtask: SubtaskInfo | undefined;
}

/**
 * Hook that automatically opens the 'plan.md' file in VS Code when a planner agent
 * generates a plan in a subtask.
 */
export function useAutoOpenPlanFile({
  isSubTask,
  subtask,
}: UseAutoOpenPlanFileOptions) {
  const hasOpenedPlanFile = useRef(false);

  const store = useDefaultStore();
  const file = store.useQuery(
    catalog.queries.makeFileQuery(subtask?.parentUid || "", "/plan.md"),
  );
  const hasPlanFile = !!file;

  // Auto-open plan file when all conditions are met:
  // 1. It's a subtask session.
  // 2. The agent assigned to the subtask is 'planner'.
  // 3. The plan file has been persisted.
  // 4. We haven't opened the plan file yet in this session.
  useEffect(() => {
    if (
      isSubTask &&
      subtask?.agent === "planner" &&
      hasPlanFile &&
      !hasOpenedPlanFile.current
    ) {
      hasOpenedPlanFile.current = true;
      // Open the plan file using the custom pochi:// protocol which VS Code handles.
      vscodeHost.openFile("pochi://-/plan.md");
    }

    // Cleanup: close any Pochi-related tabs when the component unmounts.
    return () => {
      if (subtask?.parentUid) {
        vscodeHost.closePochiTabs(subtask.parentUid);
        hasOpenedPlanFile.current = false;
      }
    };
  }, [isSubTask, subtask?.agent, hasPlanFile, subtask?.parentUid]);
}
