import { vscodeHost } from "@/lib/vscode";
import { useQuery } from "@tanstack/react-query";

export interface McpConfigPath {
  name: string;
  description: string;
  path: string;
}

export function useThirdPartyMcp() {
  const { data, isLoading } = useQuery({
    queryKey: ["thirdPartyMcpConfigs"],
    queryFn: async () => {
      return await vscodeHost.fetchAvailableThirdPartyMcpConfigs();
    },
  });

  return {
    ...data,
    isLoading,
  };
}
