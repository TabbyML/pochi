import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

type BackgroundCommandAction = () => Promise<void>;

export type UseBackgroundCommandResult =
  | {
      status: undefined;
      isVisible: undefined;
      show: undefined;
      hide: undefined;
      close: undefined;
    }
  | {
      status: "running";
      isVisible: boolean;
      show: BackgroundCommandAction;
      hide: BackgroundCommandAction;
      close: BackgroundCommandAction;
    }
  | {
      status: "finished";
      isVisible: false;
      show: undefined;
      hide: undefined;
      close: undefined;
    };

/**
 * Controls the detachable terminal view for a running background command.
 * Hiding the terminal does not stop the command.
 * @useSignals this comment is needed to enable signals in this hook
 */
export const useBackgroundCommand = (
  backgroundJobId: string,
): UseBackgroundCommandResult => {
  const { data } = useQuery({
    queryKey: ["backgroundCommand", backgroundJobId],
    queryFn: () => fetchBackgroundCommand(backgroundJobId),
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (!data) {
    return {
      status: undefined,
      isVisible: undefined,
      show: undefined,
      hide: undefined,
      close: undefined,
    } as const;
  }

  const state = data.state.value;
  if (state.status === "finished") {
    return {
      status: "finished",
      isVisible: false,
      show: undefined,
      hide: undefined,
      close: undefined,
    } as const;
  }

  return {
    status: "running",
    isVisible: state.isVisible,
    show: data.show,
    hide: data.hide,
    close: data.close,
  } as const;
};

async function fetchBackgroundCommand(backgroundJobId: string) {
  const result = await vscodeHost.readBackgroundCommand(backgroundJobId);
  return {
    state: threadSignal(result.state),
    show: result.show,
    hide: result.hide,
    close: result.close,
  };
}
