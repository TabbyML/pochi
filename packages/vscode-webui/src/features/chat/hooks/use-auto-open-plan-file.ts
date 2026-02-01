import { vscodeHost } from "@/lib/vscode";
import type { Message } from "@getpochi/livekit";
import { useEffect, useMemo, useRef } from "react";
import type { SubtaskInfo } from "./use-subtask-info";

/**
 * Options for the useAutoOpenPlanFile hook.
 */
interface UseAutoOpenPlanFileOptions {
  /** Unique identifier for the chat session. */
  uid: string;
  /** Whether the current chat is a subtask. */
  isSubTask: boolean;
  /** Information about the subtask, if applicable. */
  subtask: SubtaskInfo | undefined;
  /** List of messages in the chat session. */
  messages: Message[];
}

/**
 * Hook that automatically opens the 'plan.md' file in VS Code when a planner agent
 * generates a plan in a subtask.
 */
export function useAutoOpenPlanFile({
  uid,
  isSubTask,
  subtask,
  messages,
}: UseAutoOpenPlanFileOptions) {
  const hasOpenedPlanFile = useRef(false);

  // Check if messages contain a tool-writeToFile call with plan.md in parts.
  // This identifies if the planner agent has successfully written the plan file.
  const hasPlanFile = useMemo(() => {
    return messages.some((message) => {
      if (message.parts && Array.isArray(message.parts)) {
        return message.parts.some((part) => {
          if (
            part.type === "tool-writeToFile" &&
            part.state === "output-available"
          ) {
            const path = part.input?.path;
            // We look for 'plan.md' in the path to identify the plan file.
            return typeof path === "string" && path.includes("plan.md");
          }
          return false;
        });
      }
      return false;
    });
  }, [messages]);

  // Auto-open plan file when all conditions are met:
  // 1. It's a subtask session.
  // 2. The agent assigned to the subtask is 'planner'.
  // 3. The plan file has been detected in the messages.
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
      vscodeHost.closePochiTabs(uid);
      hasOpenedPlanFile.current = false;
    };
  }, [isSubTask, subtask?.agent, hasPlanFile, uid]);
}
