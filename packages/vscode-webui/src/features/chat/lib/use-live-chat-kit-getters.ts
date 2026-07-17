import { useSelectedModels } from "@/features/settings";
import { useAutoMemoryEnabled } from "@/lib/hooks/use-auto-memory-enabled";
import { useCustomAgents } from "@/lib/hooks/use-custom-agents";
import { useEffectiveContextWindow } from "@/lib/hooks/use-effective-context-window";
import { useLatest } from "@/lib/hooks/use-latest";
import { useMcp } from "@/lib/hooks/use-mcp";
import { useSkills } from "@/lib/hooks/use-skills";
import { vscodeAutoMemoryManager, vscodeHost } from "@/lib/vscode";
import type { AutoMemoryContext } from "@getpochi/common";
import {
  type DisplayModel,
  type McpConfigOverride,
  buildTaskScopedMcpInfo,
} from "@getpochi/common/vscode-webui-bridge";
import type { LLMRequestData } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { useCallback, useRef } from "react";
import { displayModelToLLM } from "./display-model-to-llm";

export function useLiveChatKitGetters({
  todos,
  todoModeActive,
  isSubTask,
  omitCustomRules,
  modelOverride,
  mcpConfigOverride,
  taskId,
}: {
  todos: React.RefObject<Todo[] | undefined>;
  todoModeActive?: React.RefObject<boolean>;
  isSubTask: boolean;
  omitCustomRules?: boolean;
  modelOverride?: DisplayModel;
  /** Per-task MCP tool configuration. If provided, filters the global toolset. */
  mcpConfigOverride?: McpConfigOverride | null;
  taskId?: string | null;
}) {
  const { toolset, instructions, connections } = useMcp();
  const mcpInfo = useLatest({
    toolset,
    instructions,
    connections,
    mcpConfigOverride,
  });
  const llm = useLLM({ isSubTask, modelOverride });

  const effectiveContextWindow = useEffectiveContextWindow();
  const effectiveContextWindowRef = useLatest(effectiveContextWindow);

  const { customAgents } = useCustomAgents(true);
  const customAgentsRef = useLatest(customAgents);

  const { skills } = useSkills(true);
  const skillsRef = useLatest(skills);

  const getEnvironment = useCallback(async () => {
    const environment = await vscodeHost.readEnvironment({
      omitCustomRules,
      webviewKind: globalThis.POCHI_WEBVIEW_KIND,
      taskId: taskId || undefined,
    });

    const currentTodos = todos.current;
    if (!currentTodos) {
      return environment;
    }

    return {
      ...environment,
      todos: currentTodos,
    };
  }, [todos, omitCustomRules, taskId]);

  // Read the current enable state so disabling the checkbox takes effect for
  // the current task (not just on the next mount).
  const { autoMemoryEnabled } = useAutoMemoryEnabled();
  const autoMemoryEnabledRef = useLatest(autoMemoryEnabled);

  // Snapshot once per task panel so mid-task MEMORY.md rewrites don't bust
  // the cached system+tools prefix. New memory shows on next mount.
  const autoMemoryCacheRef = useRef<Promise<
    AutoMemoryContext | undefined
  > | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies(autoMemoryEnabledRef.current): ref is stable.
  const getAutoMemory = useCallback(() => {
    // When project memory is disabled, drop any cached context so it is no
    // longer injected into the prompt and re-enabling reads it fresh.
    if (!autoMemoryEnabledRef.current) {
      autoMemoryCacheRef.current = null;
      return Promise.resolve(undefined);
    }
    if (autoMemoryCacheRef.current) return autoMemoryCacheRef.current;
    const pending = vscodeAutoMemoryManager.readContext();
    autoMemoryCacheRef.current = pending;
    pending.catch(() => {
      // Allow retry on transient failure.
      if (autoMemoryCacheRef.current === pending) {
        autoMemoryCacheRef.current = null;
      }
    });
    return pending;
  }, []);

  return {
    // biome-ignore lint/correctness/useExhaustiveDependencies(llm.current): llm is ref.
    getLLM: useCallback(() => llm.current, []),

    // biome-ignore lint/correctness/useExhaustiveDependencies(effectiveContextWindowRef.current): ref is stable.
    getEffectiveContextWindow: useCallback(
      () => effectiveContextWindowRef.current,
      [],
    ),

    getEnvironment,

    getAutoMemory,

    isTodoModeActive: useCallback(
      () => todoModeActive?.current === true,
      [todoModeActive],
    ),

    // biome-ignore lint/correctness/useExhaustiveDependencies(mcpInfo.current): mcpInfo is ref.
    getMcpInfo: useCallback(() => {
      const { toolset, instructions, connections, mcpConfigOverride } =
        mcpInfo.current;

      // If no per-task mcpConfigOverride, return global state
      if (!mcpConfigOverride || Object.keys(mcpConfigOverride).length === 0) {
        return { toolset, instructions };
      }

      return buildTaskScopedMcpInfo(connections, mcpConfigOverride);
    }, []),

    // biome-ignore lint/correctness/useExhaustiveDependencies(customAgentsRef.current): customAgentsRef is ref.
    getCustomAgents: useCallback(() => customAgentsRef.current, []),

    // biome-ignore lint/correctness/useExhaustiveDependencies(skillsRef.current): skillsRef is ref.
    getSkills: useCallback(() => skillsRef.current, []),
  };
}

function useLLM({
  isSubTask,
  modelOverride,
}: {
  isSubTask: boolean;
  modelOverride?: DisplayModel;
}): React.RefObject<LLMRequestData> {
  const { selectedModel } = useSelectedModels({ isSubTask });

  const model = modelOverride || selectedModel;
  const llmFromSelectedModel = ((): LLMRequestData => {
    if (!model) return undefined as never;
    return displayModelToLLM(model);
  })();

  return useLatest(llmFromSelectedModel);
}
