import { vscodeHost } from "@/lib/vscode";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useUserStorage } from "./use-user-storage";

/** @useSignals this comment is needed to enable signals in this hook */
export const usePochiCredentials = () => {
  const { data, refetch, isPending } = useQuery({
    queryKey: ["pochiCredentials"],
    queryFn: fetchPochiCredentials,
    // Every 1 minutes
    refetchInterval: 1000 * 60,
  });

  const userStorage = useUserStorage();
  // refecth whenever user changed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: allow
  useEffect(() => {
    refetch();
  }, [userStorage.users?.pochi]);

  return useMemo(
    () => ({
      token: data?.token || null,
      jwt: data?.jwt || null,
      isPending,
    }),
    [data?.token, data?.jwt, isPending],
  );
};

async function fetchPochiCredentials() {
  return vscodeHost.readPochiCredentials();
}
