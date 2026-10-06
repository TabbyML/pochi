import { type ChildProcess, execFile, spawn } from "node:child_process";
import { buildShellCommand } from "@getpochi/common/tool-utils";
import { buildExecuteCommandEnv } from "./execute-command-with-node";

const TerminationGraceMs = 2_000;
const TerminationPollIntervalMs = 50;
// taskkill exits with 128 when the process no longer exists.
const TaskkillProcessNotFoundExitCode = 128;

export interface BackgroundChildProcessOptions {
  command: string;
  cwd: string;
  envs?: Record<string, string>;
}

/**
 * Spawns a background command without a terminal, for hosts where node-pty is
 * unavailable (Windows, or a failed pty spawn elsewhere). Stdin is closed so
 * the command cannot block on a prompt, and output is piped to the caller.
 */
export function spawnBackgroundChildProcess({
  command,
  cwd,
  envs,
}: BackgroundChildProcessOptions): ChildProcess {
  const options = {
    cwd,
    env: buildExecuteCommandEnv({ color: false, envs }),
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
    windowsHide: true,
    // On POSIX the command leads its own process group, so stopping it also
    // reaches its descendants. Windows stops the process tree instead.
    detached: process.platform !== "win32",
  };
  const shellCommand = buildShellCommand(command);
  return shellCommand
    ? spawn(shellCommand.command, shellCommand.args, options)
    : spawn(command, { ...options, shell: true });
}

/**
 * Stops a process started by {@link spawnBackgroundChildProcess} together
 * with its descendants. Stopping only the shell would leave long-running
 * children (dev servers, watchers) orphaned.
 */
export function terminateChildProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined || hasExited(child)) return Promise.resolve();
  return process.platform === "win32"
    ? killWindowsProcessTree(child, pid)
    : killPosixProcessGroup(pid);
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function killWindowsProcessTree(
  child: ChildProcess,
  pid: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "taskkill",
      ["/pid", String(pid), "/T", "/F"],
      { windowsHide: true },
      (error) => {
        if (
          !error ||
          error.code === TaskkillProcessNotFoundExitCode ||
          hasExited(child)
        ) {
          resolve();
          return;
        }
        reject(
          new Error(`Failed to stop process tree ${pid}: ${error.message}`),
        );
      },
    );
  });
}

async function killPosixProcessGroup(pid: number): Promise<void> {
  const signal = (name: NodeJS.Signals | 0) => {
    try {
      process.kill(-pid, name);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") return false;
      // macOS may report EPERM for a group with zombies awaiting reaping.
      if (name === 0 && code === "EPERM") return true;
      throw error;
    }
  };

  if (!signal("SIGTERM")) return;
  const deadline = Date.now() + TerminationGraceMs;
  while (signal(0)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      signal("SIGKILL");
      return;
    }
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(TerminationPollIntervalMs, remaining)),
    );
  }
}
