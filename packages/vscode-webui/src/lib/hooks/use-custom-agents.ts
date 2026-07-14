import { useSelectedModels } from "@/features/settings";
import {
  type CustomAgentFile,
  type ValidCustomAgentFile,
  isValidCustomAgentFile,
} from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { resolveModelFromId } from "../utils/resolve-model-from-id";
import { vscodeHost } from "../vscode";
import { useModelList } from "./use-model-list";

/**
 * Hook to get custom agents
 * Uses ThreadSignal for real-time updates
 */

// Function overloads for different return types based on filterValidFiles
export function useCustomAgents(filterValidFiles: true): {
  customAgents: ValidCustomAgentFile[];
  isLoading: boolean;
};

export function useCustomAgents(filterValidFiles?: false): {
  customAgents: CustomAgentFile[];
  isLoading: boolean;
};

/** @useSignals */
export function useCustomAgents(filterValidFiles = false) {
  const { data: customAgentsSignal } = useQuery({
    queryKey: ["customAgents"],
    queryFn: async () => {
      return threadSignal(await vscodeHost.readCustomAgents());
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (customAgentsSignal === undefined) {
    return { customAgents: [], isLoading: true };
  }

  return {
    customAgents: filterValidFiles
      ? customAgentsSignal.value.filter(isValidCustomAgentFile)
      : customAgentsSignal.value,
    isLoading: false,
  };
}

export const useCustomAgent = (name?: string) => {
  const { customAgents, isLoading } = useCustomAgents(true);
  const { modelList } = useModelList(true);
  const { selectedModel: parentTaskModel } = useSelectedModels({
    isSubTask: false,
  });
  // Use the parent task's model as the initial fallback model for the subtask.
  let customAgentModel = parentTaskModel;

  if (!name) {
    return {
      customAgent: undefined,
      customAgentModel: parentTaskModel,
      isLoading,
    };
  }

  const customAgent = customAgents?.find((agent) => agent.name === name);
  if (customAgent?.model) {
    const resolvedModel = resolveModelFromId(customAgent.model, modelList);
    // if customAgent has configured model, use it
    if (resolvedModel) {
      customAgentModel = resolvedModel;
    }
  }
  return {
    customAgent,
    customAgentModel,
    isLoading,
  };
};
