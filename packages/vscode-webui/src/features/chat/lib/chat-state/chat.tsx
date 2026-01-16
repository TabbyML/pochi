import { type ReactNode, useRef, useState } from "react";
import { useToolCallLifeCycles } from "../use-tool-call-life-cycles";
import { ChatContext, type ChatState, type RetryCount } from "./types";

interface ChatContextProviderProps {
  children: ReactNode;
}

export function ChatContextProvider({ children }: ChatContextProviderProps) {
  const autoApproveGuard = useRef<"auto" | "manual" | "stop">("stop");
  const abortController = useRef(new AbortController());
  const [retryCount, setRetryCount] = useState<RetryCount | undefined>(
    undefined,
  );
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
    retryCount,
    setRetryCount,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function ChatContextProviderStub({
  children,
}: ChatContextProviderProps) {
  const autoApproveGuard = useRef<"auto" | "manual" | "stop">("stop");
  const abortController = useRef(new AbortController());
  const [retryCount, setRetryCount] = useState<RetryCount | undefined>(
    undefined,
  );

  const value: ChatState = {
    abortController,
    autoApproveGuard,
    getToolCallLifeCycle: (key) => {
      throw new Error(`[${key}] is not implemented in stubbed context`);
    },
    executingToolCalls: [],
    previewingToolCalls: [],
    completeToolCalls: [],
    retryCount,
    setRetryCount,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
