import { useSelectedModels } from "@/features/settings";
import { useCustomAgent } from "@/lib/hooks/use-custom-agent";
import { useLatest } from "@/lib/hooks/use-latest";
import { useMcp } from "@/lib/hooks/use-mcp";
import { vscodeHost } from "@/lib/vscode";
import { constants, type Environment } from "@getpochi/common";
import type { UserEditsDiff } from "@getpochi/common/vscode-webui-bridge";
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
  const { toolset } = useMcp();
  const mcpToolSet = useLatest(toolset);

  const llm = useLLM();

  const { customAgents } = useCustomAgent();
  const customAgentsRef = useLatest(customAgents);

  const getEnvironment = useCallback(
    async ({ messages }: { messages: readonly Message[] }) => {
      const environment = await vscodeHost.readEnvironment(isSubTask);

      let userEdits: UserEditsDiff[] | undefined;
      const lastCheckpointHash = findLastCheckpointFromMessages(messages);
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
    // biome-ignore lint/correctness/useExhaustiveDependencies(llm.current): llm is ref.
    getLLM: useCallback(() => llm.current, []),

    getEnvironment,

    // biome-ignore lint/correctness/useExhaustiveDependencies(mcpToolSet.current): mcpToolSet is ref.
    getMcpToolSet: useCallback(() => mcpToolSet.current, []),

    // biome-ignore lint/correctness/useExhaustiveDependencies(customAgentsRef.current): customAgentsRef is ref.
    getCustomAgents: useCallback(() => customAgentsRef.current, []),
  };
}

function findLastCheckpointFromMessages(
  messages: readonly Message[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    for (const part of message.parts) {
      if (part.type === "data-checkpoint" && part.data?.commit) {
        return part.data.commit;
      }
    }
  }
  return undefined;
}

function useLLM(): React.RefObject<LLMRequestData> {
  const { selectedModel } = useSelectedModels();

  const llmFromSelectedModel = ((): LLMRequestData => {
    if (!selectedModel) return undefined as never;

    if (selectedModel.type === "vendor") {
      return {
        type: "vendor",
        vendorId: selectedModel.vendorId,
        modelId: selectedModel.modelId,
        options: selectedModel.options,
        getCredentials: selectedModel.getCredentials,
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
  })();

  return useLatest(llmFromSelectedModel);
}
