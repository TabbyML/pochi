import { useSelectedModels } from "@/features/settings";
import { apiClient } from "@/lib/auth-client";
import { useLatest } from "@/lib/hooks/use-latest";
import { useMcp } from "@/lib/hooks/use-mcp";
import { vscodeHost } from "@/lib/vscode";
import type { Environment } from "@getpochi/common";
import type { UserEditsDiff } from "@getpochi/common/vscode-webui-bridge";
import type { LLMRequestData, Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { ThreadAbortSignal } from "@quilted/threads";
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

    if (selectedModel.type === "hosted") {
      return {
        type: "pochi" as const,
        modelId: selectedModel.modelId,
        apiClient,
      };
    }

    if (selectedModel.type === "vscode") {
      return {
        type: "vscode" as const,
        modelId: `${selectedModel.vscodeModel.vendor}:${selectedModel.vscodeModel.family}:${selectedModel.vscodeModel.id}:${selectedModel.vscodeModel.version}`,
        vendor: selectedModel.vscodeModel.vendor,
        family: selectedModel.vscodeModel.family,
        version: selectedModel.vscodeModel.version,
        id: selectedModel.vscodeModel.id,
        chatVSCodeLm: (options, onChunk) =>
          vscodeHost.chatVSCodeLm(
            {
              ...options,
              abortSignal: options.abortSignal
                ? ThreadAbortSignal.serialize(options.abortSignal)
                : undefined,
            },
            onChunk,
          ),
      };
    }

    const { provider } = selectedModel;
    if (provider.kind === "google-vertex-tuning") {
      return {
        type: "google-vertex-tuning" as const,
        location: provider.location,
        credentials: provider.credentials,
        modelId: selectedModel.modelId,
        maxOutputTokens: selectedModel.maxTokens,
        contextWindow: selectedModel.contextWindow,
        useToolCallMiddleware: selectedModel.useToolCallMiddleware,
      };
    }

    return {
      type: "openai" as const,
      modelId: selectedModel.modelId,
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      maxOutputTokens: selectedModel.maxTokens,
      contextWindow: selectedModel.contextWindow,
      useToolCallMiddleware: selectedModel.useToolCallMiddleware,
    };
  })();

  return useLatest(llmFromSelectedModel);
}
