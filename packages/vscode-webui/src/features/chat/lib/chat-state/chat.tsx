import { useCustomAgents } from "@/lib/hooks/use-custom-agents";
import { useLatest } from "@/lib/hooks/use-latest";
import { type ReactNode, useRef, useState } from "react";
import { BatchExecuteManager } from "../batch-execute-manager";
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
  const { executingToolCalls, getToolCallLifeCycle, completeToolCalls } =
    useToolCallLifeCycles(abortController.current.signal);
  const { customAgents } = useCustomAgents(true);
  const customAgentsRef = useLatest(customAgents);
  const batchExecuteManager = useRef(
    new BatchExecuteManager(() => customAgentsRef.current),
  ).current;

  const value: ChatState = {
    abortController,
    autoApproveGuard,
    getToolCallLifeCycle,
    executingToolCalls,
    completeToolCalls,
    retryCount,
    setRetryCount,
    batchExecuteManager,
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
  const batchExecuteManager = useRef(new BatchExecuteManager()).current;

  const value: ChatState = {
    abortController,
    autoApproveGuard,
    getToolCallLifeCycle: (key) => {
      throw new Error(`[${key}] is not implemented in stubbed context`);
    },
    executingToolCalls: [],
    completeToolCalls: [],
    retryCount,
    setRetryCount,
    batchExecuteManager,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
