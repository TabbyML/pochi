import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import type { ModelAccessResponse } from "@getpochi/vendor-pochi/edge";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { usePochiCredentials } from "./use-pochi-credentials";

export function useModelAccess() {
  const { token, sessionKey, isPending } = usePochiCredentials();
  const server = getServerBaseUrl();
  const {
    data,
    isPending: accessPending,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["modelAccess", server, sessionKey],
    enabled: !!token && !!sessionKey,
    staleTime: 30_000,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }): Promise<ModelAccessResponse> => {
      const response = await fetch(`${server}/api/billing/model-access`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        return { superModels: false };
      }
      if (!response.ok) {
        throw new Error(`Unable to load model access: ${response.status}`);
      }
      const access: ModelAccessResponse = await response.json();
      if (typeof access?.superModels !== "boolean") {
        throw new Error("Invalid model access response.");
      }
      return access;
    },
  });
  const refresh = useCallback(async () => {
    if (token && sessionKey) await refetch();
  }, [token, sessionKey, refetch]);

  return {
    superModels: !!token && data?.superModels === true,
    isLoading: isPending || (!!token && accessPending),
    isFetching,
    refetch: refresh,
  };
}
