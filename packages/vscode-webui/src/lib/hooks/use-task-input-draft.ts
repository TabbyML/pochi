import type { ChatInput } from "@/features/chat";
import { getLogger } from "@getpochi/common";
import { useEffect, useState } from "react";
import type { WebviewApi } from "vscode-webview";
import { getVSCodeApi } from "../vscode";

const logger = getLogger("use-task-input-draft");

interface TaskInputDraft {
  content: ChatInput;
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

  const [draft, setDraft] = useState<ChatInput>(() => {
    if (typeof window === "undefined")
      return {
        json: null,
        text: "",
      };

    try {
      if (vscodeApi) {
        const state = vscodeApi.getState() as VscodeState | undefined;
        const stored = state?.taskInputDraft;
        if (stored?.content?.text) {
          return stored.content;
        }
      }
    } catch (error) {
      logger.error("Failed to load draft:", error);
    }

    return {
      json: null,
      text: "",
    };
  });

  // Save draft whenever it changes
  useEffect(() => {
    if (typeof window === "undefined" || !vscodeApi) return;

    try {
      const draftText = draft.text;
      if (draftText.trim()) {
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
    setDraft({
      json: null,
      text: "",
    });
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
