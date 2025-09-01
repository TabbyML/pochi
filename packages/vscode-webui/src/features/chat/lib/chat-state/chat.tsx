import { type ReactNode, useRef } from "react";
import { useToolCallLifeCycles } from "../use-tool-call-life-cycles";
import { ChatContext, type ChatState } from "./types";

interface ChatContextProviderProps {
  children: ReactNode;
}

export function ChatContextProvider({ children }: ChatContextProviderProps) {
  const autoApproveGuard = useRef(false);
  const abortController = useRef(new AbortController());

  const {
    executingToolCalls,
    previewingToolCalls,
    getToolCallLifeCycle,
    completeToolCalls,
  } = useToolCallLifeCycles(abortController.current.signal);

  const value: ChatState = {
    abortController,
    autoApproveGuard,
    getToolCallLifeCycle,
    executingToolCalls,
    previewingToolCalls,
    completeToolCalls,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
