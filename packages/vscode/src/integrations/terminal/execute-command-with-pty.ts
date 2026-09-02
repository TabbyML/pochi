import { PtyProcess } from "./pty-process";
import type { ExecuteCommandOptions } from "./types";
import { ExecutionError, truncateOutput } from "./utils";

export {
  PtySpawnError,
  buildPtyEnv,
  buildPtyShellCommand,
  getNodePtyModulePaths,
} from "./pty-process";

export type PtyCommandResult =
  | {
      type: "completed";
      output: string;
      isTruncated: boolean;
    }
  | {
      type: "timedOut";
      ptyProcess: PtyProcess;
      output: string;
      isTruncated: boolean;
    };

export const executeCommandWithPty = async ({
  command,
  cwd,
  timeout,
  abortSignal,
  onData,
  envs,
}: ExecuteCommandOptions): Promise<PtyCommandResult> => {
  const ptyProcess = await PtyProcess.spawn({ command, cwd, envs });

  return new Promise<PtyCommandResult>((resolve, reject) => {
    let output = "";
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      abortSignal?.removeEventListener("abort", onAbort);
      dataListener.dispose();
      exitListener.dispose();
    };

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const onAbort = () => {
      settle(() => {
        ptyProcess.kill();
        reject(ExecutionError.createAbortError());
      });
    };

    const dataListener = ptyProcess.onData((data) => {
      output += data;
      onData?.(truncateOutput(output));
    });

    const exitListener = ptyProcess.onExit(({ exitCode }) => {
      settle(() => {
        if (exitCode === 0) {
          resolve({ type: "completed", ...truncateOutput(output) });
        } else {
          reject(
            ExecutionError.create(`Command exited with code ${exitCode}.`),
          );
        }
      });
    });

    if (abortSignal?.aborted) {
      onAbort();
      return;
    }
    abortSignal?.addEventListener("abort", onAbort, { once: true });

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        settle(() => {
          resolve({
            type: "timedOut",
            ptyProcess,
            ...truncateOutput(output),
          });
        });
      }, timeout * 1000);
    }
  });
};
