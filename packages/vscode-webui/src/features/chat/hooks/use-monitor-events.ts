import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/** @useSignals */
export function useMonitorEvents(taskId: string) {
  const { data } = useQuery({
    queryKey: ["monitorEvents", taskId],
    queryFn: async () => {
      const result = await vscodeHost.readMonitorEvents(taskId);
      return {
        events: threadSignal(result.events),
        acknowledge: result.acknowledge,
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
  return { events: data?.events.value ?? [], acknowledge: data?.acknowledge };
}
