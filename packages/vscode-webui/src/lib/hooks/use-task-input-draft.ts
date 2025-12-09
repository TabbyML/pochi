import { getLogger } from "@getpochi/common";
import { useEffect, useState } from "react";
import type { WebviewApi } from "vscode-webview";
import { getVSCodeApi } from "../vscode";

const logger = getLogger("use-task-input-draft");

interface TaskInputDraft {
  content: string;
  timestamp: number;
}

interface VscodeState {
  taskInputDraft?: TaskInputDraft;
}

/**
 * Hook to persist task input draft content across page navigation
 * Uses VSCode's built-in state management API
 */
export function useTaskInputDraft() {
  const vscodeApi = getVSCodeApi() as WebviewApi<VscodeState> | null;

  const [draft, setDraft] = useState<string>(() => {
    if (typeof window === "undefined") return "";

    try {
      if (vscodeApi) {
        const state = vscodeApi.getState() as VscodeState | undefined;
        const stored = state?.taskInputDraft;
        if (stored) {
          return stored.content;
        }
      }
    } catch (error) {
      logger.error("Failed to load draft:", error);
    }

    return "";
  });

  // Save draft whenever it changes
  useEffect(() => {
    if (typeof window === "undefined" || !vscodeApi) return;

    try {
      if (draft.trim()) {
        const data: TaskInputDraft = {
          content: draft,
          timestamp: Date.now(),
        };

        // Use VSCode state API
        const currentState = (vscodeApi.getState() as VscodeState) || {};
        vscodeApi.setState({
          ...currentState,
          taskInputDraft: data,
        });
      } else {
        // Clear draft if empty
        const currentState = (vscodeApi.getState() as VscodeState) || {};
        const { taskInputDraft, ...rest } = currentState;
        vscodeApi.setState(rest);
      }
    } catch (error) {
      logger.error("Failed to save draft:", error);
    }
  }, [draft, vscodeApi]);

  const clearDraft = () => {
    setDraft("");
    if (typeof window === "undefined" || !vscodeApi) return;

    try {
      const currentState = (vscodeApi.getState() as VscodeState) || {};
      const { taskInputDraft, ...rest } = currentState;
      vscodeApi.setState(rest);
    } catch (error) {
      logger.error("Failed to clear draft:", error);
    }
  };

  return {
    draft,
    setDraft,
    clearDraft,
  };
}
