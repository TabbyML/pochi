import { useSelectedModels } from "@/features/settings";
import {
  type CustomAgentFile,
  type DisplayModel,
  type ValidCustomAgentFile,
  isValidCustomAgentFile,
} from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
  const { customAgents, isLoading: customAgentsLoading } =
    useCustomAgents(true);
  const {
    modelList,
    isLoading: modelListLoading,
    isFetching: modelListFetching,
  } = useModelList(false);
  const { selectedModel: parentTaskModel } = useSelectedModels({
    isSubTask: false,
  });
  const customAgent = name
    ? customAgents.find((agent) => agent.name === name)
    : undefined;
  const customAgentModel = useMemo<DisplayModel | undefined>(() => {
    if (!customAgent?.model) return parentTaskModel;

    const resolvedModel = resolveModelFromId(customAgent.model, modelList);
    if (resolvedModel) return resolvedModel;

    if (customAgent.isBuiltIn) {
      // Built-in special models are currently served by the Pochi vendor.
      const credentialSource = modelList?.find(
        (model) => model.type === "vendor" && model.vendorId === "pochi",
      );
      if (credentialSource?.type === "vendor") {
        return {
          type: "vendor",
          id: customAgent.model,
          name: customAgent.model,
          vendorId: "pochi",
          modelId: customAgent.model,
          options: {},
          getCredentials: credentialSource.getCredentials,
        };
      }
    }

    return parentTaskModel;
  }, [customAgent?.model, customAgent?.isBuiltIn, modelList, parentTaskModel]);
  const isCustomAgentModelLoading =
    !!customAgent?.model && (modelListLoading || modelListFetching);
  const isLoading =
    !!name && (customAgentsLoading || isCustomAgentModelLoading);

  return {
    customAgent,
    customAgentModel,
    isLoading,
  };
};
