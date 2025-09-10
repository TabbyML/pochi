import { vscodeHost } from "@/lib/vscode";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

/** @useSignals this comment is needed to enable signals in this hook */
export const usePochiCredentials = () => {
  const { data } = useQuery({
    queryKey: ["pochiCredentials"],
    queryFn: fetchPochiCredentials,
    // Every 5 minutes
    refetchInterval: 1000 * 60 * 5,
  });

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
