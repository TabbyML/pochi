import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { getLogger } from "@getpochi/common";
import { getTerminalEnv } from "@getpochi/common/env-utils";
import {
  buildLaunchNonceMarker,
  buildShellCommand,
} from "@getpochi/common/tool-utils";
import type * as nodePty from "node-pty";
import * as vscode from "vscode";

const logger = getLogger("PtyProcess");
const TerminationGraceMs = 2_000;
const HardKillExitGraceMs = 1_000;
const ReplayHistoryMaxCharacters = 1_000_000;
const LaunchConfirmationTimeoutMs = 1_000;
const LaunchDiagnosticsMaxCharacters = 2_000;
const requireFromExtensionHost = createRequire(__filename);

export class PtySpawnError extends Error {
  constructor(cause: unknown, message = "Failed to spawn pty.") {
    super(message);
    this.name = "PtySpawnError";
    this.cause = cause;
  }
}

export interface PtyProcessOptions {
  command: string;
  cwd: string;
  envs?: Record<string, string>;
}

export interface PtyProcessExit {
  exitCode: number;
  signal?: number;
}

type DataListener = (data: string) => void;
type ExitListener = (event: PtyProcessExit) => void;

export const getNodePtyModulePaths = (appRoot = vscode.env.appRoot) => [
  path.join(appRoot, "node_modules.asar", "node-pty"),
  path.join(appRoot, "node_modules", "node-pty"),
];

const loadNodePty = (): typeof nodePty => {
  const errors: unknown[] = [];
  for (const modulePath of getNodePtyModulePaths()) {
    try {
      return requireFromExtensionHost(modulePath) as typeof nodePty;
    } catch (error) {
      errors.push(error);
    }
  }
  throw new AggregateError(errors, "Failed to load VS Code's node-pty module.");
};

export const buildPtyEnv = (
  envs: Record<string, string> | undefined,
): NodeJS.ProcessEnv => ({
  ...process.env,
  ...envs,
  ...getTerminalEnv(),
});

export const buildPtyShellCommand = (command: string) =>
  buildShellCommand(command, { launchNonce: randomBytes(8).toString("hex") });

/**
 * Removes the launch marker from the output stream and reports whether the
 * shell ever emitted it. While scanning it withholds the trailing bytes that
 * could still complete a marker split across chunks.
 */
class LaunchMarkerFilter {
  private buffer = "";
  private scanning = true;
  private seen = false;

  constructor(private readonly marker: string) {}

  get markerSeen(): boolean {
    return this.seen;
  }

  push(data: string): string {
    if (!this.scanning) return data;

    this.buffer += data;

    const index = this.buffer.indexOf(this.marker);
    if (index >= 0) {
      this.seen = true;
      this.scanning = false;
      const output =
        this.buffer.slice(0, index) +
        this.buffer.slice(index + this.marker.length);
      this.buffer = "";
      return output;
    }

    // Keep only a suffix that could be the start of the marker. This bounds
    // retained data without giving up on noisy or slow shell startup, and
    // lets ordinary output (including prompts) through immediately.
    let withheld = Math.min(this.buffer.length, this.marker.length - 1);
    while (
      withheld > 0 &&
      !this.buffer.endsWith(this.marker.slice(0, withheld))
    ) {
      withheld--;
    }

    const output = this.buffer.slice(0, this.buffer.length - withheld);
    this.buffer = this.buffer.slice(this.buffer.length - withheld);
    return output;
  }

  stopScanning(): string {
    this.scanning = false;
    const pending = this.buffer;
    this.buffer = "";
    return pending;
  }
}

export class PtyProcess {
  private readonly dataListeners = new Set<DataListener>();
  private readonly exitListeners = new Set<ExitListener>();
  private readonly history: string[] = [];
  private historyCharacters = 0;
  private rawExitEvent: PtyProcessExit | undefined;
  private exitEvent: PtyProcessExit | undefined;
  private forceKillTimer: ReturnType<typeof setTimeout> | undefined;
  private hardKillExitTimer: ReturnType<typeof setTimeout> | undefined;
  private terminationRequested = false;
  private readonly launchFilter: LaunchMarkerFilter | undefined;
  private readonly launchListeners = new Set<(error?: PtySpawnError) => void>();
  private launchSettled = false;
  private launchError: PtySpawnError | undefined;
  private launchOutput = "";

  private constructor(
    private readonly process: nodePty.IPty,
    launchNonce?: string,
  ) {
    this.launchFilter = launchNonce
      ? new LaunchMarkerFilter(buildLaunchNonceMarker(launchNonce))
      : undefined;

    process.onData((raw) => {
      if (!this.launchSettled) {
        this.launchOutput = (this.launchOutput + raw).slice(
          -LaunchDiagnosticsMaxCharacters,
        );
      }
      const data = this.launchFilter ? this.launchFilter.push(raw) : raw;
      if (this.launchFilter?.markerSeen) this.settleLaunch();
      if (data) this.emitData(data);
    });
    process.onExit((event) => {
      if (this.rawExitEvent) return;
      this.rawExitEvent = event;
      this.clearTerminationTimers();
      const pending = this.launchFilter?.stopScanning();
      if (pending) this.emitData(pending);
      if (this.launchFilter && !this.launchSettled) {
        this.settleLaunch(
          new PtySpawnError(
            `Shell exited with code ${event.exitCode} before emitting the launch marker, output: ${JSON.stringify(this.launchOutput)}`,
            "Pty shell exited before confirming launch.",
          ),
        );
      }
      // UnixTerminal emits node-pty's exit only after its PTY socket closes,
      // so all data callbacks have already been delivered at this boundary.
      this.publishExit(event);
    });
  }

  static async spawn({ command, cwd, envs }: PtyProcessOptions) {
    const shellCommand = buildPtyShellCommand(command);
    if (!shellCommand) {
      throw new PtySpawnError("Failed to get shell.");
    }

    let pty: typeof nodePty;
    try {
      pty = loadNodePty();
    } catch (error) {
      throw new PtySpawnError(error);
    }

    let ptyProcess: PtyProcess;
    try {
      const { command: shell, args, launchNonce } = shellCommand;
      logger.debug(
        `Spawning pty command: ${command} in ${cwd}, shell: ${shell}, args: ${args}`,
      );
      ptyProcess = new PtyProcess(
        pty.spawn(shell, args, {
          name: "xterm-256color",
          cols: 80,
          rows: 30,
          cwd,
          env: buildPtyEnv(envs),
        }),
        launchNonce,
      );
    } catch (error) {
      throw new PtySpawnError(error);
    }

    await ptyProcess.waitForLaunch();
    return ptyProcess;
  }

  /**
   * Resolves once the shell confirms it started by emitting the launch marker.
   * Rejects with a {@link PtySpawnError} when the shell exits first, which is
   * how a POSIX `execvp` failure surfaces: node-pty's helper exits without
   * throwing on the extension host side.
   */
  async waitForLaunch(timeoutMs = LaunchConfirmationTimeoutMs): Promise<void> {
    if (!this.launchFilter) return;
    if (this.launchSettled) {
      if (this.launchError) throw this.launchError;
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => this.settleLaunch(), timeoutMs);
      const listener = (error?: PtySpawnError) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      this.launchListeners.add(listener);
    });
  }

  private settleLaunch(error?: PtySpawnError): void {
    if (this.launchSettled) return;
    this.launchSettled = true;
    this.launchError = error;
    this.launchOutput = "";
    // A timeout only ends the launch wait. Keep filtering until the marker
    // arrives or the process exits, including partial markers across timeout.
    for (const listener of [...this.launchListeners]) listener(error);
    this.launchListeners.clear();
  }

  private emitData(data: string): void {
    this.appendHistory(data);
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }

  onData(listener: DataListener): vscode.Disposable {
    this.dataListeners.add(listener);
    return { dispose: () => this.dataListeners.delete(listener) };
  }

  subscribeWithReplay(listener: DataListener): {
    replay: readonly string[];
    disposable: vscode.Disposable;
  } {
    const replay = [...this.history];
    const disposable = this.onData(listener);
    return { replay, disposable };
  }

  private appendHistory(data: string): void {
    this.history.push(data);
    this.historyCharacters += data.length;
    while (this.historyCharacters > ReplayHistoryMaxCharacters) {
      const firstChunk = this.history[0] ?? "";
      const overflow = this.historyCharacters - ReplayHistoryMaxCharacters;
      if (firstChunk.length <= overflow) {
        this.history.shift();
        this.historyCharacters -= firstChunk.length;
      } else {
        this.history[0] = firstChunk.slice(overflow);
        this.historyCharacters -= overflow;
      }
    }
  }

  /** Fires at node-pty's socket-close boundary, after queued output drains. */
  onExit(listener: ExitListener): vscode.Disposable {
    if (this.exitEvent) {
      let cancelled = false;
      const event = this.exitEvent;
      queueMicrotask(() => {
        if (!cancelled) listener(event);
      });
      return {
        dispose: () => {
          cancelled = true;
        },
      };
    }
    this.exitListeners.add(listener);
    return { dispose: () => this.exitListeners.delete(listener) };
  }

  write(data: string): void {
    if (this.rawExitEvent) return;
    try {
      this.process.write(data);
    } catch (error) {
      logger.debug("Failed to write to exited pty process", error);
    }
  }

  resize(columns: number, rows: number): void {
    if (this.rawExitEvent || columns <= 0 || rows <= 0) return;
    try {
      this.process.resize(columns, rows);
    } catch (error) {
      logger.debug("Failed to resize exited pty process", error);
    }
  }

  pauseOutput(): void {
    if (this.rawExitEvent) return;
    try {
      this.process.pause();
    } catch (error) {
      logger.debug("Failed to pause exited pty process", error);
    }
  }

  resumeOutput(): void {
    if (this.rawExitEvent) return;
    try {
      this.process.resume();
    } catch (error) {
      logger.debug("Failed to resume exited pty process", error);
    }
  }

  kill(signal = "SIGTERM"): void {
    if (this.rawExitEvent) return;

    if (signal === "SIGKILL" || this.terminationRequested) {
      this.sendSignal("SIGKILL");
      this.scheduleSyntheticHardKillExit();
      return;
    }

    this.terminationRequested = true;
    this.sendSignal(signal);
    this.forceKillTimer = setTimeout(() => {
      if (this.rawExitEvent) return;
      this.sendSignal("SIGKILL");
      this.scheduleSyntheticHardKillExit();
    }, TerminationGraceMs);
  }

  private sendSignal(signal: string): void {
    try {
      this.process.kill(signal);
    } catch (error) {
      logger.debug(`Failed to send ${signal} to exited pty process`, error);
    }
  }

  private scheduleSyntheticHardKillExit(): void {
    if (this.hardKillExitTimer || this.rawExitEvent) return;
    this.hardKillExitTimer = setTimeout(() => {
      if (this.rawExitEvent) return;
      logger.warn("Pty did not emit an exit event after SIGKILL");
      const event = { exitCode: 137, signal: 9 };
      this.rawExitEvent = event;
      this.publishExit(event);
    }, HardKillExitGraceMs);
  }

  private publishExit(event: PtyProcessExit): void {
    if (this.exitEvent) return;
    this.exitEvent = event;
    for (const listener of this.exitListeners) listener(event);
    this.exitListeners.clear();
  }

  private clearTerminationTimers(): void {
    if (this.forceKillTimer) clearTimeout(this.forceKillTimer);
    if (this.hardKillExitTimer) clearTimeout(this.hardKillExitTimer);
    this.forceKillTimer = undefined;
    this.hardKillExitTimer = undefined;
  }
}
