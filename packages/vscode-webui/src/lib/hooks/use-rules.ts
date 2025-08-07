import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

export const useRules = () => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["rules"],
    queryFn: () => vscodeHost.listRuleFiles(),
    refetchInterval: 3000,
  });

  return {
    rules: data ?? [],
    isLoading,
    refetch,
  };
};
