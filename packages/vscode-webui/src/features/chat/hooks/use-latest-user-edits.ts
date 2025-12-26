import { useUserEdits } from "@/lib/hooks/use-user-edits";
import type { FileDiff } from "@getpochi/common/vscode-webui-bridge";
import { useCallback, useState } from "react";

export const useLatestUserEdits = (taskId: string) => {
  const [latestUserEdits, setLatestUserEdits] = useState<
    FileDiff[] | undefined
  >(undefined);
  const userEdits = useUserEdits(taskId);

  const saveLatestUserEdits = useCallback(() => {
    setLatestUserEdits(userEdits);
  }, [userEdits]);

  return { saveLatestUserEdits, latestUserEdits };
};
