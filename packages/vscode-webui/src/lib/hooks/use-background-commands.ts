import { vscodeHost } from "@/lib/vscode";
import type { BackgroundCommands } from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

type BackgroundCommandAction = (backgroundJobId: string) => Promise<void>;

export type UseBackgroundCommandsResult =
  | {
      backgroundCommands: undefined;
      show: undefined;
      hide: undefined;
      close: undefined;
    }
  | {
      backgroundCommands: BackgroundCommands;
      show: BackgroundCommandAction;
      hide: BackgroundCommandAction;
      close: BackgroundCommandAction;
    };

/**
 * Returns all running detachable background commands and controls their
 * terminal views by id. Hiding a terminal does not stop its command.
 * @useSignals this comment is needed to enable signals in this hook
 */
export const useBackgroundCommands = (): UseBackgroundCommandsResult => {
  const { data } = useQuery({
    queryKey: ["backgroundCommands"],
    queryFn: fetchBackgroundCommands,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (!data) {
    return {
      backgroundCommands: undefined,
      show: undefined,
      hide: undefined,
      close: undefined,
    } as const;
  }

  return {
    backgroundCommands: data.backgroundCommands.value,
    show: data.show,
    hide: data.hide,
    close: data.close,
  } as const;
};

async function fetchBackgroundCommands() {
  const result = await vscodeHost.readBackgroundCommands();
  return {
    backgroundCommands: threadSignal(result.backgroundCommands),
    show: result.show,
    hide: result.hide,
    close: result.close,
  };
}
