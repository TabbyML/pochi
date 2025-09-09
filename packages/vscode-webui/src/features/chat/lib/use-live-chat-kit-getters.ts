// Register the models
import "@getpochi/vendor-pochi/edge";
import "@getpochi/vendor-gemini-cli/edge";
import "./vscode-lm";

import { useSelectedModels } from "@/features/settings";
import { useCustomAgents } from "@/lib/hooks/use-custom-agents";
import { useLatest } from "@/lib/hooks/use-latest";
import { useMcp } from "@/lib/hooks/use-mcp";
import { vscodeHost } from "@/lib/vscode";
import { constants, type Environment } from "@getpochi/common";
import { createModel } from "@getpochi/common/vendor/edge";
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
  const { toolset, instructions } = useMcp();
  const mcpInfo = useLatest({ toolset, instructions });

  const llm = useLLM();

  const { customAgents } = useCustomAgents();
  const customAgentsRef = useLatest(customAgents);

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
    // biome-ignore lint/correctness/useExhaustiveDependencies(llm.current): llm is ref.
    getLLM: useCallback(() => llm.current, []),

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

function useLLM(): React.RefObject<LLMRequestData> {
  const { selectedModel } = useSelectedModels();

  const llmFromSelectedModel = ((): LLMRequestData => {
    if (!selectedModel) return undefined as never;

    if (selectedModel.type === "vendor") {
      return {
        type: "vendor",
        keepReasoningPart:
          selectedModel.vendorId === "pochi" &&
          selectedModel.modelId.includes("claude"),
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
