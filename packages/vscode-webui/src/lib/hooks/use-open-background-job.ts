import { useVisibleTerminals } from "@/lib/hooks/use-visible-terminals";
import { vscodeHost } from "@/lib/vscode";
import { useCallback, useMemo } from "react";

/**
 * Resolves what a background job / terminal control can open: the live
 * terminal while it exists, its recorded output file once the terminal is
 * gone.
 */
export function useOpenBackgroundJob(
  backgroundJobId: string,
  outputFile: string | undefined,
) {
  const { terminals, openBackgroundJobTerminal } = useVisibleTerminals();
  const liveTerminal = useMemo(
    () => terminals?.find((tm) => tm.backgroundJobId === backgroundJobId),
    [backgroundJobId, terminals],
  );

  // `terminals === undefined` means "not loaded yet", which must not be
  // reported as a closed terminal.
  const isTerminalClosed = terminals !== undefined && !liveTerminal;
  const canOpenOutputFile = isTerminalClosed && outputFile !== undefined;

  const openTerminal = useCallback(() => {
    openBackgroundJobTerminal?.(backgroundJobId);
  }, [backgroundJobId, openBackgroundJobTerminal]);

  const openOutputFile = useCallback(() => {
    if (outputFile) vscodeHost.openFile(outputFile);
  }, [outputFile]);

  const open = useCallback(() => {
    if (isTerminalClosed) {
      openOutputFile();
      return;
    }
    openTerminal();
  }, [isTerminalClosed, openOutputFile, openTerminal]);

  return {
    liveTerminal,
    isTerminalClosed,
    canOpenOutputFile,
    open,
    // The two halves of `open`, for callers that offer them as separate
    // controls rather than as one badge.
    openTerminal,
    openOutputFile,
  };
}
