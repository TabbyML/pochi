import { useContext } from "react";

import { ChatContext, type ChatState } from "./types";

function useChatState(): ChatState {
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

export function useBatchExecuteManager() {
  return useChatState().batchExecuteManager;
}

export function useToolCallLifeCycle() {
  const { getToolCallLifeCycle, executingToolCalls, completeToolCalls } =
    useChatState();

  const isExecuting = executingToolCalls.length > 0;
  return {
    getToolCallLifeCycle,
    executingToolCalls,
    completeToolCalls,
    isExecuting,
  };
}

export function useRetryCount() {
  const { retryCount, setRetryCount } = useChatState();
  return {
    retryCount,
    setRetryCount,
  };
}

export { ChatContextProvider, ChatContextProviderStub } from "./chat";
export {
  ToolCallStatusRegistry,
  FixedStateChatContextProvider,
} from "./fixed-state";
