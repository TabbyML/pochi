import {
  type CustomAgentFile,
  type ValidCustomAgentFile,
  isValidCustomAgentFile,
} from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

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
  const { customAgents } = useCustomAgents(true);
  if (!name) {
    return undefined;
  }
  const customAgent = customAgents?.find((agent) => agent.name === name);
  return customAgent;
};
