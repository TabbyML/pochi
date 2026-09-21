import { type ChildProcess, spawn } from "node:child_process";
import { getShellPath } from "@getpochi/common/tool-utils";

const processGroups = new WeakSet<ChildProcess>();
const stopping = new WeakMap<ChildProcess, Promise<boolean>>();
const TerminationGraceMs = 1000;

/** Keep the shell and its descendants in a group that the CLI can stop together. */
export function spawnCommand(
  command: string,
  options: { cwd: string; env: NodeJS.ProcessEnv },
) {
  const child = spawn(command, {
    ...options,
    shell: getShellPath(),
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  processGroups.add(child);
  return child;
}

export function stopCommand(child: ChildProcess): Promise<boolean> {
  const existing = stopping.get(child);
  if (existing) return existing;
  const pending = stopProcessTree(child);
  stopping.set(child, pending);
  return pending;
}

async function stopProcessTree(child: ChildProcess): Promise<boolean> {
  const pid = child.pid;
  // Adopted processes supplied by other callers may not own a process group.
  if (!processGroups.has(child) || !pid) return child.kill();

  if (process.platform === "win32") {
    return new Promise<boolean>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.once("error", () => resolve(child.kill()));
      killer.once("close", (code) =>
        resolve(
          code === 0 || child.exitCode !== null || child.signalCode !== null,
        ),
      );
    });
  }

  const signalGroup = (signal: NodeJS.Signals | 0) => {
    try {
      process.kill(-pid, signal);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
      throw error;
    }
  };

  if (!signalGroup("SIGTERM")) return true;
  const deadline = Date.now() + TerminationGraceMs;
  // The shell can exit before a descendant closes its pipes, or a descendant
  // can redirect its pipes entirely. Check the group, not just the shell's exit.
  while (signalGroup(0)) {
    if (Date.now() >= deadline) {
      signalGroup("SIGKILL");
      break;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  return true;
}
