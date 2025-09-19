import Emittery from "emittery";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FixedStateToolCallLifeCycle } from "../fixed-state-tool-call-life-cycle";
import type { StreamingResult } from "../tool-call-life-cycle";
import {
  ChatContext,
  type ChatState,
  type ToolCallLifeCycleKey,
} from "./types";

function keyString(key: ToolCallLifeCycleKey) {
  return JSON.stringify({
    toolName: key.toolName,
    toolCallId: key.toolCallId,
  });
}

export class ToolCallStatusRegistry extends Emittery<{ updated: undefined }> {
  private toolCallStatusMap = new Map<
    string,
    {
      toolCallId: string;
      toolName: string;
      isExecuting: boolean;
      streamingResult?: StreamingResult;
    }
  >();

  get(key: ToolCallLifeCycleKey) {
    return this.toolCallStatusMap.get(keyString(key));
  }

  set(
    key: ToolCallLifeCycleKey,
    value: { isExecuting: boolean; streamingResult?: StreamingResult },
  ) {
    this.toolCallStatusMap.set(keyString(key), { ...key, ...value });
    this.emit("updated");
  }

  delete(key: ToolCallLifeCycleKey) {
    this.toolCallStatusMap.delete(keyString(key));
    this.emit("updated");
  }

  entries() {
    return this.toolCallStatusMap.entries();
  }
}

interface FixedStateChatContextProviderProps {
  toolCallStatusRegistry?: ToolCallStatusRegistry | undefined;
  children: ReactNode;
}

export function FixedStateChatContextProvider({
  toolCallStatusRegistry,
  children,
}: FixedStateChatContextProviderProps) {
  const autoApproveGuard = useRef("stop" as const);
  const abortController = useRef(new AbortController());

  const [toolCallLifeCycles, setToolCallLifeCycles] = useState<
    Map<string, FixedStateToolCallLifeCycle>
  >(new Map());

  useEffect(() => {
    if (!toolCallStatusRegistry) {
      return;
    }
    const unsubscribe = toolCallStatusRegistry.on("updated", () => {
      setToolCallLifeCycles(
        new Map(
          [...toolCallStatusRegistry.entries()].map(([key, value]) => {
            return [
              key,
              new FixedStateToolCallLifeCycle(
                value.toolName,
                value.toolCallId,
                value.isExecuting ? "execute" : "dispose",
                value.streamingResult,
              ),
            ];
          }),
        ),
      );
    });
    return () => unsubscribe();
  }, [toolCallStatusRegistry]);

  const getToolCallLifeCycle = useCallback(
    (key: ToolCallLifeCycleKey) => {
      return (
        toolCallLifeCycles.get(keyString(key)) ??
        new FixedStateToolCallLifeCycle(
          key.toolName,
          key.toolCallId,
          "dispose",
          undefined,
        )
      );
    },
    [toolCallLifeCycles],
  );

  const executingToolCalls = useMemo(
    () =>
      [...toolCallLifeCycles.values()].filter((lc) => lc.status === "execute"),
    [toolCallLifeCycles],
  );

  const completeToolCalls: FixedStateToolCallLifeCycle[] = [];

  const value: ChatState = {
    autoApproveGuard,
    abortController,
    getToolCallLifeCycle,
    executingToolCalls,
    completeToolCalls,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
