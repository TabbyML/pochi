import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/** @useSignals */
export const useBrowserSessions = () => {
  const { data } = useQuery({
    queryKey: ["browserSessions"],
    queryFn: readBrowserSessions,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data?.value || {};
};

async function readBrowserSessions() {
  return threadSignal(await vscodeHost.readBrowserSessions());
}
