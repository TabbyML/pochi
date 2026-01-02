// Register the models
import "@getpochi/vendor-pochi/edge";
import "@getpochi/vendor-gemini-cli/edge";
import "@getpochi/vendor-claude-code/edge";
import "@getpochi/vendor-codex/edge";
import "@getpochi/vendor-github-copilot/edge";
import "@getpochi/vendor-qwen-code/edge";

import { useSelectedModels } from "@/features/settings";
import { useCustomAgents } from "@/lib/hooks/use-custom-agents";
import { useLatest } from "@/lib/hooks/use-latest";
import { useMcp } from "@/lib/hooks/use-mcp";
import { vscodeHost } from "@/lib/vscode";
import { constants, type Environment } from "@getpochi/common";
import { createModel } from "@getpochi/common/vendor/edge";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import type { LLMRequestData } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { useCallback } from "react";

export function useLiveChatKitGetters({
  todos,
  isSubTask,
  modelOverride,
}: {
  todos: React.RefObject<Todo[] | undefined>;
  isSubTask: boolean;
  modelOverride?: DisplayModel;
}) {
  const { toolset, instructions } = useMcp();
  const mcpInfo = useLatest({ toolset, instructions });
  const llm = useLLM({ isSubTask, modelOverride });

  const { customAgents } = useCustomAgents(true);
  const customAgentsRef = useLatest(customAgents);

  const getEnvironment = useCallback(async () => {
    const environment = await vscodeHost.readEnvironment({
      isSubTask,
      webviewKind: globalThis.POCHI_WEBVIEW_KIND,
    });

    return {
      todos: todos.current,
      ...environment,
    } satisfies Environment;
  }, [todos, isSubTask]);

  return {
    // biome-ignore lint/correctness/useExhaustiveDependencies(llm.current): llm is ref.
    getLLM: useCallback(() => llm.current, []),

    getEnvironment,

    // biome-ignore lint/correctness/useExhaustiveDependencies(mcpInfo.current): mcpInfo is ref.
    getMcpInfo: useCallback(() => mcpInfo.current, []),

    // biome-ignore lint/correctness/useExhaustiveDependencies(customAgentsRef.current): customAgentsRef is ref.
    getCustomAgents: useCallback(() => customAgentsRef.current, []),
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
