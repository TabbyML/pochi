import { vscodeHost } from "@/lib/vscode";
import type { Task } from "@getpochi/livekit";
import { useMutation } from "@tanstack/react-query";

export const useNewCompactTask = ({
  task,
  compact,
}: {
  task?: Task;
  compact: () => Promise<string>;
}) => {
  const mutation = useMutation({
    mutationFn: async () => {
      return compact();
    },
    onSuccess: (summary) => {
      const initMessages = [
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [
            {
              type: "text",
              text: summary,
            },
            {
              type: "text",
              text: "I've summarized the task and start a new task with the summary. Please analysis the current status, and use askFollowupQuestion with me to confirm the next steps",
            },
          ],
        },
      ];

      const cwd = task?.cwd;
      if (!cwd) {
        throw new Error(
          "Cannot get task cwd when creating new task with summary.",
        );
      }

      // open new task
      vscodeHost.openTaskInPanel({
        type: "compact-task",
        cwd,
        messages: JSON.stringify(initMessages),
      });
    },
  });

  return {
    newCompactTaskPending: mutation.isPending,
    newCompactTask: () => mutation.mutate(),
  };
};
