import Emittery from "emittery";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BatchExecuteManager } from "../batch-execute-manager";
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

const ToolCallStatusRegistryStreamingThrottleMs = 300;

type ToolCallStatusRegistryEntry = {
  toolCallId: string;
  toolName: string;
  isExecuting: boolean;
  streamingResult?: StreamingResult;
};

export class ToolCallStatusRegistry extends Emittery<{ updated: undefined }> {
  private toolCallStatusMap = new Map<string, ToolCallStatusRegistryEntry>();
  private pendingStreamingUpdateTimer:
    | ReturnType<typeof globalThis.setTimeout>
    | undefined;

  private readonly streamingThrottleMs: number;

  constructor(
    options: { streamingThrottleMs?: number | undefined } | undefined = {},
  ) {
    super();
    this.streamingThrottleMs =
      options.streamingThrottleMs ?? ToolCallStatusRegistryStreamingThrottleMs;
  }

  get(key: ToolCallLifeCycleKey) {
    return this.toolCallStatusMap.get(keyString(key));
  }

  set(
    key: ToolCallLifeCycleKey,
    value: { isExecuting: boolean; streamingResult?: StreamingResult },
  ) {
    const mapKey = keyString(key);
    const previous = this.toolCallStatusMap.get(mapKey);
    this.toolCallStatusMap.set(mapKey, { ...key, ...value });

    if (shouldThrottleStreamingUpdate(previous, value)) {
      this.scheduleStreamingUpdate();
      return;
    }

    this.emitUpdatedImmediately();
  }

  delete(key: ToolCallLifeCycleKey) {
    this.toolCallStatusMap.delete(keyString(key));
    this.emitUpdatedImmediately();
  }

  entries() {
    return this.toolCallStatusMap.entries();
  }

  private scheduleStreamingUpdate() {
    if (this.pendingStreamingUpdateTimer !== undefined) {
      return;
    }

    this.pendingStreamingUpdateTimer = globalThis.setTimeout(() => {
      this.pendingStreamingUpdateTimer = undefined;
      this.emitUpdated();
    }, this.streamingThrottleMs);
  }

  private emitUpdatedImmediately() {
    if (this.pendingStreamingUpdateTimer !== undefined) {
      globalThis.clearTimeout(this.pendingStreamingUpdateTimer);
      this.pendingStreamingUpdateTimer = undefined;
    }
    this.emitUpdated();
  }

  private emitUpdated() {
    this.emit("updated");
  }
}

function shouldThrottleStreamingUpdate(
  previous: ToolCallStatusRegistryEntry | undefined,
  value: { isExecuting: boolean; streamingResult?: StreamingResult },
) {
  return (
    previous?.isExecuting === true &&
    value.isExecuting === true &&
    value.streamingResult !== undefined
  );
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

  const batchExecuteManager = useRef(new BatchExecuteManager()).current;

  const value: ChatState = {
    autoApproveGuard,
    abortController,
    getToolCallLifeCycle,
    executingToolCalls,
    completeToolCalls,
    retryCount: undefined,
    setRetryCount: () => {},
    batchExecuteManager,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
