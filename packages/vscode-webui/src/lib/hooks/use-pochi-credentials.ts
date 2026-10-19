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
      sessionKey: data?.sessionKey ?? null,
      isPending,
    }),
    [data?.token, data?.jwt, data?.sessionKey, isPending],
  );
};

async function fetchPochiCredentials() {
  const credentials = await vscodeHost.readPochiCredentials();
  if (!credentials) return null;
  // Scope access caches to the session without putting the token in query keys.
  const digest = credentials.token
    ? await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(credentials.token),
      )
    : null;
  const sessionKey = digest
    ? Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("")
    : null;
  return { ...credentials, sessionKey };
}
