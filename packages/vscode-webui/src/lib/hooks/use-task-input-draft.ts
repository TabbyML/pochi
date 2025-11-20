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
 * Uses VSCode's built-in state management API when available,
 * falls back to localStorage in non-VSCode environments
 */
export function useTaskInputDraft() {
  const vscodeApi = getVSCodeApi() as WebviewApi<VscodeState> | null;

  const [draft, setDraft] = useState<string>(() => {
    if (typeof window === "undefined") return "";

    try {
      // Try VSCode state API first
      if (vscodeApi) {
        const state = vscodeApi.getState() as VscodeState | undefined;
        const stored = state?.taskInputDraft;
        if (stored) {
          // Optional: Clear drafts older than 24 hours
          const hoursSinceLastEdit =
            (Date.now() - stored.timestamp) / (1000 * 60 * 60);
          if (hoursSinceLastEdit < 24) {
            return stored.content;
          }
        }
      } else {
        // Fallback to localStorage for non-VSCode environments
        const stored = localStorage.getItem("pochi-create-task-input-draft");
        if (stored) {
          const parsed = JSON.parse(stored) as TaskInputDraft;
          const hoursSinceLastEdit =
            (Date.now() - parsed.timestamp) / (1000 * 60 * 60);
          if (hoursSinceLastEdit < 24) {
            return parsed.content;
          }
        }
      }
    } catch (error) {
      logger.error("Failed to load draft:", error);
    }

    return "";
  });

  // Save draft whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (draft.trim()) {
        const data: TaskInputDraft = {
          content: draft,
          timestamp: Date.now(),
        };

        if (vscodeApi) {
          // Use VSCode state API
          const currentState = (vscodeApi.getState() as VscodeState) || {};
          vscodeApi.setState({
            ...currentState,
            taskInputDraft: data,
          });
        } else {
          // Fallback to localStorage
          localStorage.setItem(
            "pochi-create-task-input-draft",
            JSON.stringify(data),
          );
        }
      } else {
        // Clear draft if empty
        if (vscodeApi) {
          const currentState = (vscodeApi.getState() as VscodeState) || {};
          const { taskInputDraft, ...rest } = currentState;
          vscodeApi.setState(rest);
        } else {
          localStorage.removeItem("pochi-create-task-input-draft");
        }
      }
    } catch (error) {
      logger.error("Failed to save draft:", error);
    }
  }, [draft, vscodeApi]);

  const clearDraft = () => {
    setDraft("");
    if (typeof window === "undefined") return;

    try {
      if (vscodeApi) {
        const currentState = (vscodeApi.getState() as VscodeState) || {};
        const { taskInputDraft, ...rest } = currentState;
        vscodeApi.setState(rest);
      } else {
        localStorage.removeItem("pochi-create-task-input-draft");
      }
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
