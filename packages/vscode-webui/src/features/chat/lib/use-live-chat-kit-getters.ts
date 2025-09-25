// Register the models
import "@getpochi/vendor-pochi/edge";
import "@getpochi/vendor-gemini-cli/edge";
import "@getpochi/vendor-claude-code/edge";
import "@getpochi/vendor-github-copilot/edge";
import "./vscode-lm";

import { useSelectedModels } from "@/features/settings";
import { useCustomAgents } from "@/lib/hooks/use-custom-agents";
import { useLatest } from "@/lib/hooks/use-latest";
import { useMcp } from "@/lib/hooks/use-mcp";
import { vscodeHost } from "@/lib/vscode";
import { constants, type Environment } from "@getpochi/common";
import { createModel } from "@getpochi/common/vendor/edge";
import type {
  DisplayModel,
  UserEditsDiff,
} from "@getpochi/common/vscode-webui-bridge";
import type { LLMRequestData, Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { useCallback } from "react";

export function useLiveChatKitGetters({
  todos,
  isSubTask = false,
}: {
  todos: React.RefObject<Todo[] | undefined>;
  isSubTask?: boolean;
}) {
  const { toolset, instructions } = useMcp();
  const mcpInfo = useLatest({ toolset, instructions });

  const { customAgents } = useCustomAgents(true);
  const customAgentsRef = useLatest(customAgents);
  const { selectedModel, models } = useSelectedModels();
  const modelsInfoRef = useLatest({ selectedModel, models });

  // biome-ignore lint/correctness/useExhaustiveDependencies: (modelsInfoRef.current): modelsInfoRef is ref.
  const getLLM = useCallback((options?: { messages: readonly Message[] }) => {
    const models = modelsInfoRef.current.models;
    const selectedModel = modelsInfoRef.current.selectedModel;

    const modelIdFromMessages = extractModelIdFromMessages(options?.messages);
    const validModelFromMessages = modelIdFromMessages
      ? models?.find((m) => m.id === modelIdFromMessages)
      : undefined;

    return getLLMByModel(validModelFromMessages || selectedModel);
  }, []);

  const getEnvironment = useCallback(
    async ({ messages }: { messages: readonly Message[] }) => {
      const environment = await vscodeHost.readEnvironment(isSubTask);

      let userEdits: UserEditsDiff[] | undefined;
      const lastCheckpointHash = findSecondLastCheckpointFromMessages(messages);
      if (lastCheckpointHash) {
        userEdits =
          (await vscodeHost.diffWithCheckpoint(lastCheckpointHash)) ??
          undefined;
      }

      return {
        todos: todos.current,
        ...environment,
        userEdits,
      } satisfies Environment;
    },
    [todos, isSubTask],
  );

  return {
    getLLM,

    getEnvironment,

    // biome-ignore lint/correctness/useExhaustiveDependencies(mcpInfo.current): mcpInfo is ref.
    getMcpInfo: useCallback(() => mcpInfo.current, []),

    // biome-ignore lint/correctness/useExhaustiveDependencies(customAgentsRef.current): customAgentsRef is ref.
    getCustomAgents: useCallback(() => customAgentsRef.current, []),
  };
}

function findSecondLastCheckpointFromMessages(
  messages: readonly Message[],
): string | undefined {
  let foundCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    for (let j = message.parts.length - 1; j >= 0; j--) {
      const part = message.parts[j];
      if (part.type === "data-checkpoint" && part.data?.commit) {
        foundCount++;
        if (foundCount === 2) {
          return part.data.commit;
        }
      }
    }
  }
  return undefined;
}

function extractModelIdFromMessages(messages: readonly Message[] | undefined) {
  if (!messages) return undefined;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (part.type === "text" && part.text) {
        const workflowTagRegex = /<workflow[^>]*model="([^"]*)"[^>]*>/;
        const match = part.text.match(workflowTagRegex);
        if (match?.[1]) {
          return match[1];
        }
      }
    }
  }

  return undefined;
}

function getLLMByModel(selectedModel: DisplayModel | undefined) {
  if (!selectedModel) return undefined as never;

  if (selectedModel.type === "vendor") {
    return {
      type: "vendor" as const,
      useToolCallMiddleware: selectedModel.options.useToolCallMiddleware,
      getModel: (id: string) =>
        createModel(selectedModel.vendorId, {
          id,
          modelId: selectedModel.modelId,
          getCredentials: selectedModel.getCredentials,
        }),
    };
  }

  const { provider } = selectedModel;
  if (provider.kind === "google-vertex-tuning") {
    return {
      type: "google-vertex-tuning" as const,
      modelId: selectedModel.modelId,
      vertex: provider.vertex,
      maxOutputTokens:
        selectedModel.options.maxTokens ?? constants.DefaultMaxOutputTokens,
      contextWindow:
        selectedModel.options.contextWindow ?? constants.DefaultContextWindow,
      useToolCallMiddleware: selectedModel.options.useToolCallMiddleware,
    };
  }

  if (provider.kind === "ai-gateway") {
    return {
      type: "ai-gateway" as const,
      modelId: selectedModel.modelId,
      apiKey: provider.apiKey,
      maxOutputTokens:
        selectedModel.options.maxTokens ?? constants.DefaultMaxOutputTokens,
      contextWindow:
        selectedModel.options.contextWindow ?? constants.DefaultContextWindow,
      useToolCallMiddleware: selectedModel.options.useToolCallMiddleware,
    };
  }

  if (provider.kind === "openai-responses") {
    return {
      type: "openai-responses" as const,
      modelId: selectedModel.modelId,
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      maxOutputTokens:
        selectedModel.options.maxTokens ?? constants.DefaultMaxOutputTokens,
      contextWindow:
        selectedModel.options.contextWindow ?? constants.DefaultContextWindow,
      useToolCallMiddleware: selectedModel.options.useToolCallMiddleware,
    };
  }

  if (provider.kind === undefined || provider.kind === "openai") {
    return {
      type: "openai" as const,
      modelId: selectedModel.modelId,
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      maxOutputTokens:
        selectedModel.options.maxTokens ?? constants.DefaultMaxOutputTokens,
      contextWindow:
        selectedModel.options.contextWindow ?? constants.DefaultContextWindow,
      useToolCallMiddleware: selectedModel.options.useToolCallMiddleware,
    };
  }

  assertUnreachable(provider.kind);
}

function useLLM(): React.RefObject<LLMRequestData> {
  const { selectedModel } = useSelectedModels();
  const llmFromSelectedModel = ((): LLMRequestData => {
    if (!selectedModel) return undefined as never;

    if (selectedModel.type === "vendor") {
      return {
        type: "vendor",
        useToolCallMiddleware: selectedModel.options.useToolCallMiddleware,
        getModel: (id: string) =>
          createModel(selectedModel.vendorId, {
            id,
            modelId: selectedModel.modelId,
            getCredentials: selectedModel.getCredentials,
          }),
      };
    }

    const { provider } = selectedModel;
    if (provider.kind === "google-vertex-tuning") {
      return {
        type: "google-vertex-tuning" as const,
        modelId: selectedModel.modelId,
        vertex: provider.vertex,
        maxOutputTokens:
          selectedModel.options.maxTokens ?? constants.DefaultMaxOutputTokens,
        contextWindow:
          selectedModel.options.contextWindow ?? constants.DefaultContextWindow,
        useToolCallMiddleware: selectedModel.options.useToolCallMiddleware,
      };
    }

    if (provider.kind === "ai-gateway") {
      return {
        type: "ai-gateway" as const,
        modelId: selectedModel.modelId,
        apiKey: provider.apiKey,
        maxOutputTokens:
          selectedModel.options.maxTokens ?? constants.DefaultMaxOutputTokens,
        contextWindow:
          selectedModel.options.contextWindow ?? constants.DefaultContextWindow,
        useToolCallMiddleware: selectedModel.options.useToolCallMiddleware,
      };
    }

    if (provider.kind === "openai-responses") {
      return {
        type: "openai-responses" as const,
        modelId: selectedModel.modelId,
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        maxOutputTokens:
          selectedModel.options.maxTokens ?? constants.DefaultMaxOutputTokens,
        contextWindow:
          selectedModel.options.contextWindow ?? constants.DefaultContextWindow,
        useToolCallMiddleware: selectedModel.options.useToolCallMiddleware,
      };
    }

    if (provider.kind === undefined || provider.kind === "openai") {
      return {
        type: "openai" as const,
        modelId: selectedModel.modelId,
        baseURL: provider.baseURL,
        apiKey: provider.apiKey,
        maxOutputTokens:
          selectedModel.options.maxTokens ?? constants.DefaultMaxOutputTokens,
        contextWindow:
          selectedModel.options.contextWindow ?? constants.DefaultContextWindow,
        useToolCallMiddleware: selectedModel.options.useToolCallMiddleware,
      };
    }

    assertUnreachable(provider.kind);
  })();

  return useLatest(llmFromSelectedModel);
}

function assertUnreachable(_x: never): never {
  throw new Error("Didn't expect to get here");
}
