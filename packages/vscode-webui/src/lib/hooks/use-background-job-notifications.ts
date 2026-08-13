import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/** @useSignals */
export function useBackgroundJobNotifications(taskId: string) {
  const { data } = useQuery({
    queryKey: ["backgroundJobNotifications", taskId],
    queryFn: async () => {
      const result = await vscodeHost.readBackgroundJobNotifications(taskId);
      return {
        notifications: threadSignal(result.notifications),
        acknowledge: result.acknowledge,
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  return {
    notifications: data?.notifications.value ?? [],
    acknowledge: data?.acknowledge,
  };
}
