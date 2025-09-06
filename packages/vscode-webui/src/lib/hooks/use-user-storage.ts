import { vscodeHost } from "@/lib/vscode";
import type { UserInfo } from "@getpochi/common/configuration";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/** @useSignals this comment is needed to enable signals in this hook */
export const useUserStorage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["userStorage"],
    queryFn: fetchUserStorage,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return { users: data?.value, isLoading };
};

async function fetchUserStorage() {
  const signal = threadSignal<Record<string, UserInfo>>(
    await vscodeHost.readUserStorage(),
  );
  return signal;
}
