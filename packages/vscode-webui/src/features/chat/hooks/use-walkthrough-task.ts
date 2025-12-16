import { vscodeHost } from "@/lib/vscode";
import type { Task } from "@getpochi/livekit";
import { useMutation } from "@tanstack/react-query";

export const useWalkthroughTask = ({
  task,
  walkthrough,
}: {
  task?: Task;
  walkthrough: () => Promise<string>;
}) => {
  const mutation = useMutation({
    mutationFn: async () => {
      return walkthrough();
    },
    onSuccess: async (walkthroughText) => {
      const cwd = task?.cwd;
      if (!cwd) {
        throw new Error("Cannot get task cwd when creating walkthrough.");
      }

      const filename = `${cwd}/.pochi/walkthrough/task-${task.id}.md`;
      vscodeHost.writeToFile(filename, walkthroughText);
    },
  });

  return {
    walkthroughTaskPending: mutation.isPending,
    walkthroughTask: () => mutation.mutate(),
  };
};
