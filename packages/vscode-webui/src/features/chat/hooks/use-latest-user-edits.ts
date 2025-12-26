import { useUserEdits } from "@/lib/hooks/use-user-edits";
import type { FileDiff } from "@getpochi/common/vscode-webui-bridge";
import { useCallback, useRef } from "react";

export const useLatestUserEdits = (taskId: string) => {
  const latestUserEditsRef = useRef<FileDiff[] | undefined>(undefined);
  const userEdits = useUserEdits(taskId);

  const saveLatestUserEdits = useCallback(() => {
    latestUserEditsRef.current = userEdits;
  }, [userEdits]);

  return { saveLatestUserEdits, latestUserEdits: latestUserEditsRef };
};
