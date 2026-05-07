// Register the models
import "@getpochi/vendor-pochi/edge";
import "@getpochi/vendor-tabby/edge";
import "@getpochi/vendor-gemini-cli/edge";
import "@getpochi/vendor-codex/edge";
import "@getpochi/vendor-github-copilot/edge";
import "@getpochi/vendor-qwen-code/edge";

import { useSelectedModels } from "@/features/settings";
import { useCustomAgents } from "@/lib/hooks/use-custom-agents";
import { useLatest } from "@/lib/hooks/use-latest";
import { useMcp } from "@/lib/hooks/use-mcp";
import { useSkills } from "@/lib/hooks/use-skills";
import { vscodeHost } from "@/lib/vscode";
import { constants, type Environment } from "@getpochi/common";
import type { AutoMemoryContext } from "@getpochi/common";
import { createModel } from "@getpochi/common/vendor/edge";
import {
  type DisplayModel,
  type McpConfigOverride,
  buildTaskScopedMcpInfo,
} from "@getpochi/common/vscode-webui-bridge";
import type { LLMRequestData } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { useCallback, useRef } from "react";

export function useLiveChatKitGetters({
  todos,
  isSubTask,
  omitCustomRules,
  modelOverride,
  mcpConfigOverride,
  taskId,
}: {
  todos: React.RefObject<Todo[] | undefined>;
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

    return {
      todos: todos.current,
      ...environment,
    } satisfies Environment;
  }, [todos, omitCustomRules, taskId]);

  // Snapshot once per hook lifetime — i.e. once per task panel — so MEMORY.md
  // rewrites by the extraction/dream agents during the task don't bust the
  // cached system+tools prefix on subsequent turns. New memory becomes
  // visible only when the panel is remounted (new task session).
  const autoMemoryCacheRef = useRef<Promise<
    AutoMemoryContext | undefined
  > | null>(null);
  const getAutoMemory = useCallback(() => {
    if (autoMemoryCacheRef.current) return autoMemoryCacheRef.current;
    const pending = vscodeHost.readAutoMemory();
    autoMemoryCacheRef.current = pending;
    // Allow retry on transient failure.
    pending.catch(() => {
      if (autoMemoryCacheRef.current === pending) {
        autoMemoryCacheRef.current = null;
      }
    });
    return pending;
  }, []);

  return {
    // biome-ignore lint/correctness/useExhaustiveDependencies(llm.current): llm is ref.
    getLLM: useCallback(() => llm.current, []),

    getEnvironment,

    getAutoMemory,

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
    if (model.type === "vendor") {
      return {
        id: model.id,
        type: "vendor",
        useToolCallMiddleware: model.options.useToolCallMiddleware,
        getModel: () =>
          createModel(model.vendorId, {
            modelId: model.modelId,
            getCredentials: model.getCredentials,
          }),
        contentType: model.contentType,
      };
    }

    const { provider } = model;
    if (provider.kind === "google-vertex-tuning") {
      return {
        id: model.id,
        type: "google-vertex-tuning" as const,
        modelId: model.modelId,
        vertex: provider.vertex,
        maxOutputTokens:
          model.options.maxTokens ?? constants.DefaultMaxOutputTokens,
        contextWindow:
          model.options.contextWindow ?? constants.DefaultContextWindow,
        useToolCallMiddleware: model.options.useToolCallMiddleware,
        contentType: model.contentType,
      };
    }

    if (provider.kind === "ai-gateway") {
      return {
        id: model.id,
        type: "ai-gateway" as const,
        modelId: model.modelId,
        apiKey: provider.apiKey,
        maxOutputTokens:
          model.options.maxTokens ?? constants.DefaultMaxOutputTokens,
        contextWindow:
          model.options.contextWindow ?? constants.DefaultContextWindow,
        useToolCallMiddleware: model.options.useToolCallMiddleware,
        contentType: model.contentType,
      };
    }

    if (
      provider.kind === undefined ||
      provider.kind === "openai" ||
      provider.kind === "anthropic" ||
      provider.kind === "openai-responses"
    ) {
      return {
        id: model.id,
        type: provider.kind || "openai",
        modelId: model.modelId,
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        maxOutputTokens:
          model.options.maxTokens ?? constants.DefaultMaxOutputTokens,
        contextWindow:
          model.options.contextWindow ?? constants.DefaultContextWindow,
        useToolCallMiddleware: model.options.useToolCallMiddleware,
        contentType: model.contentType,
      };
    }

    assertUnreachable(provider.kind);
  })();

  return useLatest(llmFromSelectedModel);
}

function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}
