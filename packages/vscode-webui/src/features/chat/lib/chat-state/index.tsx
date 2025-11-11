import { useContext } from "react";

import { ChatContext, type ChatState } from "./types";

export function useChatState(): ChatState {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChatState must be used within a ChatContextProvider");
  }
  return context;
}

export function useAutoApproveGuard() {
  return useChatState().autoApproveGuard;
}

export function useChatAbortController() {
  return useChatState().abortController;
}

export function useToolCallLifeCycle() {
  const {
    getToolCallLifeCycle,
    executingToolCalls,
    previewingToolCalls,
    completeToolCalls,
  } = useChatState();

  const isExecuting = executingToolCalls.length > 0;
  const isPreviewing = previewingToolCalls.length > 0;
  return {
    getToolCallLifeCycle,
    executingToolCalls,
    previewingToolCalls,
    completeToolCalls,
    isExecuting,
    isPreviewing,
  };
}

export { ChatContextProvider } from "./chat";
export {
  ToolCallStatusRegistry,
  FixedStateChatContextProvider,
} from "./fixed-state";
