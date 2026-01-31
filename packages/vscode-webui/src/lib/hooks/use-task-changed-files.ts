import { vscodeHost } from "@/lib/vscode";
import type { ChangedFileContent } from "@getpochi/common/vscode-webui-bridge";
import type { Message } from "@getpochi/livekit";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

async function fetchTaskChangedFiles(taskId: string) {
  const result = await vscodeHost.readTaskChangedFiles(taskId);
  return {
    ...result,
    changedFiles: threadSignal(result.changedFiles),
    visibleChangedFiles: threadSignal(result.visibleChangedFiles),
  };
}

/** @useSignals this comment is needed to enable signals in this hook */
export const useTaskChangedFiles = (
  taskId: string,
  messages: Message[],
  _isExecuting?: boolean,
) => {
  // Use query to fetch and subscribe to signals
  const { data } = useQuery({
    queryKey: ["taskChangedFiles", taskId],
    queryFn: () => fetchTaskChangedFiles(taskId),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const changedFiles = data?.changedFiles?.value ?? [];
  const visibleChangedFiles = data?.visibleChangedFiles?.value ?? [];

  const latestCheckpoint = useMemo(() => {
    return messages
      .flatMap((m) => m.parts.filter((p) => p.type === "data-checkpoint"))
      .map((p) => p.data.commit)
      .at(-1);
  }, [messages]);

  const showFileChanges = useCallback(
    async (filePath?: string) => {
      if (visibleChangedFiles.length === 0) {
        return;
      }
      await data?.showChangedFiles(filePath);
    },
    [visibleChangedFiles, data],
  );

  const revertFileChanges = useCallback(
    async (filepath?: string) => {
      await data?.revertChangedFile(filepath);
    },
    [data],
  );

  const acceptChangedFile = useCallback(
    async (filepath?: string) => {
      if (!latestCheckpoint) {
        return;
      }

      const content: ChangedFileContent = {
        type: "checkpoint",
        commit: latestCheckpoint,
      };

      await data?.acceptChangedFile(content, filepath);
    },
    [latestCheckpoint, data],
  );

  return {
    changedFiles,
    visibleChangedFiles,
    showFileChanges,
    revertFileChanges,
    acceptChangedFile,
  };
};
