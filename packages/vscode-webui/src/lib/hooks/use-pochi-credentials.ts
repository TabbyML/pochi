import { vscodeHost } from "@/lib/vscode";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useUserStorage } from "./use-user-storage";

/** @useSignals this comment is needed to enable signals in this hook */
export const usePochiCredentials = () => {
  const { data, refetch } = useQuery({
    queryKey: ["pochiCredentials"],
    queryFn: fetchPochiCredentials,
    // Every 5 minutes
    refetchInterval: 1000 * 60 * 5,
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
    }),
    [data?.token, data?.jwt],
  );
};

async function fetchPochiCredentials() {
  return vscodeHost.readPochiCredentials();
}
