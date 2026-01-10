import { joinPath, normalizeRelativePath } from "@/lib/utils/path";
import { vscodeHost } from "@/lib/vscode";
import { getLogger } from "@getpochi/common";
import { catalog, getWalkthroughPath } from "@getpochi/livekit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDefaultStore } from "../use-default-store";
import { useCurrentWorkspace } from "./use-current-workspace";

const logger = getLogger("use-walkthrough-path");

export function useWalkthroughPath(taskId: string | undefined) {
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId ?? ""));
  const { data: currentWorkspace } = useCurrentWorkspace();

  const walkthroughRelativePath = useMemo(
    () => (taskId ? getWalkthroughPath(taskId) : undefined),
    [taskId],
  );

  const walkthroughBasePath = useMemo(
    () => currentWorkspace?.workspacePath ?? task?.cwd ?? null,
    [currentWorkspace?.workspacePath, task?.cwd],
  );

  const walkthroughPath = useMemo(() => {
    if (!walkthroughBasePath || !walkthroughRelativePath) {
      return undefined;
    }
    return joinPath(
      walkthroughBasePath,
      normalizeRelativePath(walkthroughRelativePath),
    );
  }, [walkthroughBasePath, walkthroughRelativePath]);

  const [hasExistingWalkthrough, setHasExistingWalkthrough] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refreshWalkthroughStatus = useCallback(async () => {
    if (!walkthroughPath) {
      setHasExistingWalkthrough(false);
      setError(null);
      return;
    }

    try {
      setIsChecking(true);
      setError(null);
      const fileExists = await vscodeHost.checkFileExists(walkthroughPath);
      logger.debug(`checkFileExists for ${walkthroughPath}: ${fileExists}`);
      setHasExistingWalkthrough(fileExists);
    } catch (error) {
      logger.error("Failed to check walkthrough file existence", error);
      setHasExistingWalkthrough(false);
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsChecking(false);
    }
  }, [walkthroughPath]);

  useEffect(() => {
    void refreshWalkthroughStatus();
  }, [refreshWalkthroughStatus]);

  return {
    walkthroughPath,
    walkthroughBasePath,
    hasExistingWalkthrough,
    isChecking,
    error,
    refreshWalkthroughStatus,
  };
}
