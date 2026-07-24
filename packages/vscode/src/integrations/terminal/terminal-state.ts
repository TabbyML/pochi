import { randomUUID } from "node:crypto";
import { getLogger } from "@/lib/logger";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { OutputManager } from "./output";
import { TerminalJob } from "./terminal-job";
import { ExecutionError } from "./utils";

const logger = getLogger("TerminalState");

export interface TerminalInfo {
  name: string;
  isActive: boolean;
  /**
   * A stable id for the terminal that can be passed to `readBackgroundJobOutput`.
   *
   * The prefix encodes the terminal's origin:
   * - `bgjob-` — a Pochi-started background job. Can be read and killed.
   * - `term-`  — a user-opened terminal. Read-only; `killBackgroundJob` refuses
   *   these because they are not tracked by the `TerminalJob` registry.
   */
  backgroundJobId?: string;
}

@injectable()
@singleton()
export class TerminalState implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  /**
   * Stable ids assigned to regular (non-background-job) terminals so their
   * shell execution output can be captured and read.
   */
  private readonly terminalIds = new WeakMap<vscode.Terminal, string>();

  /**
   * Maps an in-flight shell execution to the OutputManager collecting its
   * output, so it can be finalized when the execution ends.
   */
  private readonly runningExecutions = new Map<
    vscode.TerminalShellExecution,
    OutputManager
  >();

  // Signal containing the current active terminals
  visibleTerminals = signal<TerminalInfo[]>([]);

  constructor() {
    this.visibleTerminals.value = this.listVisibleTerminals();
    this.setupEventListeners();
  }

  public openBackgroundJobTerminal(backgroundJobId: string) {
    const terminal = vscode.window.terminals.find(
      (t) => this.getTerminalId(t) === backgroundJobId,
    );
    if (!terminal) return;
    terminal.show();
  }

  /**
   * Set up listeners for terminal changes
   */
  private setupEventListeners() {
    this.disposables.push(
      vscode.window.onDidChangeActiveTerminal(this.onTerminalChanged),
    );
    this.disposables.push(
      vscode.window.onDidOpenTerminal(this.onTerminalChanged),
    );
    this.disposables.push(
      vscode.window.onDidCloseTerminal(this.onTerminalClosed),
    );
    this.disposables.push(TerminalJob.onDidDispose(this.onTerminalChanged));

    // Capture output from shell executions in regular terminals so the model
    // can read them via `readBackgroundJobOutput`. Background job terminals
    // capture their own output and are skipped here.
    this.disposables.push(
      vscode.window.onDidStartTerminalShellExecution(
        this.onShellExecutionStart,
      ),
    );
    this.disposables.push(
      vscode.window.onDidEndTerminalShellExecution(this.onShellExecutionEnd),
    );
  }

  /**
   * Update the active terminals signal when terminals change
   */
  private onTerminalChanged = () => {
    this.visibleTerminals.value = this.listVisibleTerminals();
  };

  private onTerminalClosed = (terminal: vscode.Terminal) => {
    const id = this.terminalIds.get(terminal);
    if (id) {
      OutputManager.delete(id);
    }
    this.onTerminalChanged();
  };

  private onShellExecutionStart = (
    event: vscode.TerminalShellExecutionStartEvent,
  ) => {
    // Background job terminals are handled by their own TerminalJob.
    if (TerminalJob.get(event.terminal)) {
      return;
    }

    const id = this.getTerminalId(event.terminal);
    // Start a fresh capture for this execution so a read returns the output of
    // the most recent command run in the terminal.
    const outputManager = OutputManager.create({
      id,
      command: event.execution.commandLine.value,
    });
    this.runningExecutions.set(event.execution, outputManager);
    this.captureExecutionOutput(event.execution, outputManager);
    // Reflect the newly readable terminal in the environment.
    this.onTerminalChanged();
  };

  private onShellExecutionEnd = (
    event: vscode.TerminalShellExecutionEndEvent,
  ) => {
    const outputManager = this.runningExecutions.get(event.execution);
    if (!outputManager) return;
    this.runningExecutions.delete(event.execution);

    const error =
      event.exitCode === undefined || event.exitCode === 0
        ? undefined
        : ExecutionError.create(`Command exited with code ${event.exitCode}.`);
    outputManager.finalize(error);
  };

  private async captureExecutionOutput(
    execution: vscode.TerminalShellExecution,
    outputManager: OutputManager,
  ): Promise<void> {
    try {
      for await (const chunk of execution.read()) {
        outputManager.addChunk(chunk);
      }
    } catch (error) {
      logger.debug(`Failed to read terminal shell execution output: ${error}`);
    }
  }

  /**
   * Resolves a stable id for a terminal. Background job terminals use their job
   * id; regular terminals are assigned a `bgjob-` id lazily.
   */
  getTerminalId(terminal: vscode.Terminal): string {
    const job = TerminalJob.get(terminal);
    if (job) return job.id;

    let id = this.terminalIds.get(terminal);
    if (!id) {
      // `term-` distinguishes user-opened terminals from Pochi background jobs
      // (`bgjob-`), which cannot be killed via `killBackgroundJob`.
      id = `term-${randomUUID()}`;
      this.terminalIds.set(terminal, id);
    }
    return id;
  }

  private listVisibleTerminals(): TerminalInfo[] {
    return vscode.window.terminals
      .filter((t) => {
        if ("hideFromUser" in t.creationOptions) {
          return !t.creationOptions.hideFromUser;
        }
        return true;
      })
      .map((t) => ({
        name: t.name || "Unnamed Terminal",
        isActive: t === vscode.window.activeTerminal,
        backgroundJobId: this.getTerminalId(t),
      }));
  }

  /**
   * Release all resources held by this class
   */
  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
