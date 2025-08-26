import { useStore } from "@livestore/react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ToolCallLifeCycleKey } from "./chat-state/types";
import { ManagedToolCallLifeCycle } from "./tool-call-life-cycle";

// Hook to manage tool call states
export function useToolCallLifeCycles(abortController: AbortController) {
  const { store } = useStore();

  const [toolCallLifeCycles, setToolCallLifeCycles] = useState<
    Map<string, ManagedToolCallLifeCycle>
  >(new Map());

  // Expose toolCallLifeCycles for debugging
  // @ts-ignore
  window.toolCallLifeCycles = [...toolCallLifeCycles.values()];

  const completeToolCalls = useMemo(() => {
    const complete = [];
    for (const lifecycle of toolCallLifeCycles.values()) {
      if (lifecycle.status === "complete") {
        complete.push(lifecycle);
      }
    }
    return complete;
  }, [toolCallLifeCycles]);

  const executingToolCalls = useMemo(() => {
    const executing = [];
    for (const lifecycle of toolCallLifeCycles.values()) {
      if (lifecycle.status.startsWith("execute")) {
        executing.push(lifecycle);
      }
    }
    return executing;
  }, [toolCallLifeCycles]);

  const previewingToolCalls = useMemo(() => {
    const previewing = [];
    for (const lifecycle of toolCallLifeCycles.values()) {
      if (lifecycle.status === "init" || lifecycle.status === "pending") {
        previewing.push(lifecycle);
      }
    }
    return previewing;
  }, [toolCallLifeCycles]);

  const reloadToolCallLifeCycles = useCallback(() => {
    setToolCallLifeCycles(new Map(toolCallLifeCyclesRef.current));
  }, []);

  // Ref to track latest status for immediate access
  const toolCallLifeCyclesRef = useRef<Map<string, ManagedToolCallLifeCycle>>(
    new Map(),
  );

  const getToolCallLifeCycle = useCallback(
    (key: ToolCallLifeCycleKey) => {
      if (!toolCallLifeCyclesRef.current.has(key.toolCallId)) {
        const lifecycle = new ManagedToolCallLifeCycle(
          store,
          key,
          abortController,
        );
        toolCallLifeCyclesRef.current.set(key.toolCallId, lifecycle);
        const unsubscribe = lifecycle.onAny((name) => {
          reloadToolCallLifeCycles();

          // Clean up listeners when the tool call is completed
          if (name === "dispose") {
            unsubscribe();
          }
        });
      }

      return toolCallLifeCyclesRef.current.get(
        key.toolCallId,
        // Guaranteed to exist because we just set it above
      ) as ManagedToolCallLifeCycle;
    },
    [store, abortController, reloadToolCallLifeCycles],
  );

  return {
    getToolCallLifeCycle,
    executingToolCalls,
    previewingToolCalls,
    completeToolCalls,
  };
}
