import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/**
 * Controls the detachable terminal view for a running background command.
 * Hiding the terminal does not stop the command.
 * @useSignals this comment is needed to enable signals in this hook
 */
export const useBackgroundCommand = (backgroundJobId: string) => {
  const { data } = useQuery({
    queryKey: ["backgroundCommand", backgroundJobId],
    queryFn: () => fetchBackgroundCommand(backgroundJobId),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return {
    isVisible: data?.isVisible.value,
    show: data?.show,
    hide: data?.hide,
    close: data?.close,
  };
};

async function fetchBackgroundCommand(backgroundJobId: string) {
  const result = await vscodeHost.readBackgroundCommand(backgroundJobId);
  return {
    isVisible: threadSignal(result.isVisible),
    show: result.show,
    hide: result.hide,
    close: result.close,
  };
}
