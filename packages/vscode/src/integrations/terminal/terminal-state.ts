import { randomUUID } from "node:crypto";
import { getLogger } from "@/lib/logger";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { TaskDataStore } from "@/lib/task-data-store";
import { createBackgroundJobNotification } from "@getpochi/common";
import {
  PlainOutputSanitizer,
  cleanupStaleTerminalOutputFiles,
} from "@getpochi/common/tool-utils";
import type { BackgroundCommands } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { TerminalHistoryManager } from "./terminal-history";
import { TerminalJob } from "./terminal-job";
import { ExecutionError } from "./utils";

const logger = getLogger("TerminalState");

export interface TerminalInfo {
  name: string;
  isActive: boolean;
  /**
   * Whether a shell command is executing in the terminal right now.
   *
   * Only tracked for user terminals: background job terminals report their
   * lifecycle through job notifications instead, and always read `false` here.
   * Requires shell integration; without it no execution events arrive and the
   * terminal stays permanently idle.
   */
  isRunning?: boolean;
  /** The most recent command captured from the terminal, if any. */
  lastCommand?: string;
  /**
   * A stable id associated with the terminal's output file.
   *
   * The prefix encodes the terminal's origin:
   * - `bgjob-cmd-` — a Pochi-started background job. Can be read and killed.
   * - `term-`  — a user-opened terminal. Read-only; `killBackgroundJob` refuses
   *   these because they are not tracked by the `TerminalJob` registry.
   */
  backgroundJobId?: string;
  /** Absolute transcript path readable with readFile. */
  outputFile?: string;
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
   * Maps an in-flight shell execution to the TerminalHistoryManager
   * collecting its output, so it can be finalized when the execution ends.
   */
  private readonly runningExecutions = new Map<
    vscode.TerminalShellExecution,
    {
      terminalId: string;
      history: TerminalHistoryManager;
      captureFinished: Promise<void>;
    }
  >();

  // Signals containing the current terminals and detachable background commands.
  visibleTerminals = signal<TerminalInfo[]>([]);
  backgroundCommands = signal<BackgroundCommands>({});

  constructor(private readonly taskDataStore: TaskDataStore) {
    void cleanupStaleTerminalOutputFiles().catch((error) => {
      logger.debug(`Failed to clean up stale terminal output files: ${error}`);
    });
    this.refreshTerminalState();
    this.setupEventListeners();
  }

  public openBackgroundJobTerminal(backgroundJobId: string) {
    const job = TerminalJob.get(backgroundJobId);
    if (job) {
      job.show();
      return;
    }

    const terminal = vscode.window.terminals.find(
      (t) => this.getTerminalId(t) === backgroundJobId,
    );
    terminal?.show();
  }

  public showBackgroundCommand(backgroundJobId: string): void {
    this.getBackgroundCommand(backgroundJobId)?.show();
  }

  public hideBackgroundCommand(backgroundJobId: string): void {
    this.getBackgroundCommand(backgroundJobId)?.hide();
  }

  public closeBackgroundCommand(backgroundJobId: string): void {
    this.getBackgroundCommand(backgroundJobId)?.closePtyProcess();
  }

  private getBackgroundCommand(
    backgroundJobId: string,
  ): TerminalJob | undefined {
    const job = TerminalJob.get(backgroundJobId);
    return job?.isPtyTerminal && !job.isFinished ? job : undefined;
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
    this.disposables.push(TerminalJob.onDidCreate(this.onTerminalChanged));
    // A terminal is reported with an empty `name` until its shell process
    // reports a title. Shell integration activating is the first event after
    // that point, so it is when a freshly opened terminal finally has a name
    // worth publishing.
    this.disposables.push(
      vscode.window.onDidChangeTerminalShellIntegration(this.onTerminalChanged),
    );
    this.disposables.push(TerminalJob.onDidDispose(this.onTerminalChanged));
    this.disposables.push(
      TerminalJob.onDidChangeVisibility(this.onTerminalChanged),
    );
    this.disposables.push(
      TerminalJob.onDidFinish((event) => {
        void this.taskDataStore.addBackgroundJobNotification(
          event.taskId,
          createBackgroundJobNotification(event),
        );
      }),
    );

    // Capture output from shell executions in regular terminals so the model
    // can read them via `readFile`. Background job terminals
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

  /** Update terminal and background command signals when terminal state changes. */
  private onTerminalChanged = () => {
    this.refreshTerminalState();
  };

  private refreshTerminalState(): void {
    this.visibleTerminals.value = this.listVisibleTerminals();
    this.backgroundCommands.value = this.listBackgroundCommands();
  }

  private onTerminalClosed = (terminal: vscode.Terminal) => {
    const id = this.terminalIds.get(terminal);
    if (id) {
      TerminalHistoryManager.delete(id);
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
    const command = event.execution.commandLine.value;
    // Reuse the same manager across commands so a regular terminal's history
    // (cwd + command + output for each command run in it) accumulates over
    // time, the same way it would look in the terminal itself, instead of
    // being wiped out by the next command.
    const history = TerminalHistoryManager.getOrCreate(id);
    history.terminalName = event.terminal.name;
    const cwd = event.terminal.shellIntegration?.cwd?.fsPath;
    const headerWritten = history.beginCommand(command, cwd);

    const captureFinished = this.captureExecutionOutput(
      event.execution,
      history,
      headerWritten,
    );
    this.runningExecutions.set(event.execution, {
      terminalId: id,
      history,
      captureFinished,
    });
    // Reflect the command immediately, then expose its output file only after
    // the reconstructed command header has actually reached the transcript.
    this.onTerminalChanged();
    void headerWritten.then(this.onTerminalChanged, (error) => {
      logger.debug(`Failed to initialize terminal transcript: ${error}`);
    });
  };

  private onShellExecutionEnd = async (
    event: vscode.TerminalShellExecutionEndEvent,
  ) => {
    const runningExecution = this.runningExecutions.get(event.execution);
    if (!runningExecution) return;
    this.runningExecutions.delete(event.execution);
    await runningExecution.captureFinished;

    const error =
      event.exitCode === undefined || event.exitCode === 0
        ? undefined
        : ExecutionError.create(`Command exited with code ${event.exitCode}.`);
    runningExecution.history.finalize(error);
    // The terminal is idle again; without this the `isRunning` flag published
    // on start would stay on until some unrelated terminal event fires.
    this.onTerminalChanged();
  };

  private hasRunningExecution(terminalId: string): boolean {
    for (const execution of this.runningExecutions.values()) {
      if (execution.terminalId === terminalId) return true;
    }
    return false;
  }

  private async captureExecutionOutput(
    execution: vscode.TerminalShellExecution,
    history: TerminalHistoryManager,
    headerWritten: Promise<void>,
  ): Promise<void> {
    const sanitizer = new PlainOutputSanitizer();
    try {
      await headerWritten;
      for await (const chunk of execution.read()) {
        const plainText = sanitizer.write(chunk);
        if (plainText.length > 0) await history.addChunk(plainText);
      }
      const remainder = sanitizer.end();
      if (remainder.length > 0) await history.addChunk(remainder);
    } catch (error) {
      logger.debug(`Failed to read terminal shell execution output: ${error}`);
    }
  }

  /**
   * Resolves a stable id for a terminal. Background job terminals use their job
   * id; regular terminals are assigned a `term-` id lazily.
   */
  getTerminalId(terminal: vscode.Terminal): string {
    const job = TerminalJob.get(terminal);
    if (job) return job.id;

    let id = this.terminalIds.get(terminal);
    if (!id) {
      // `term-` distinguishes user-opened terminals, which cannot be killed
      // through `killBackgroundJob`, from managed `bgjob-cmd-` terminals.
      id = `term-${randomUUID()}`;
      this.terminalIds.set(terminal, id);
      TerminalHistoryManager.getOrCreate(id);
    }
    return id;
  }

  private listBackgroundCommands(): BackgroundCommands {
    return Object.fromEntries(
      TerminalJob.list()
        .filter((job) => job.isPtyTerminal && !job.isFinished)
        .map((job) => [job.id, { isVisible: job.isVisible }]),
    );
  }

  private listVisibleTerminals(): TerminalInfo[] {
    const listedJobIds = new Set<string>();
    const terminals: TerminalInfo[] = vscode.window.terminals
      .filter((terminal) => {
        if ("hideFromUser" in terminal.creationOptions) {
          return !terminal.creationOptions.hideFromUser;
        }
        return true;
      })
      .map((terminal) => {
        const id = this.getTerminalId(terminal);
        const job = TerminalJob.get(terminal);
        let lastCommand: string | undefined;
        if (job) {
          listedJobIds.add(job.id);
        } else {
          const history = TerminalHistoryManager.getOrCreate(id);
          history.terminalName = terminal.name;
          lastCommand = history.lastCommand;
        }
        return {
          name: terminal.name,
          isActive: terminal === vscode.window.activeTerminal,
          isRunning: this.hasRunningExecution(id),
          lastCommand,
          backgroundJobId: id,
          outputFile: this.getTerminalOutputFile(terminal),
        };
      });

    for (const job of TerminalJob.list()) {
      if (!job.isPtyTerminal || listedJobIds.has(job.id)) continue;
      terminals.push({
        name: job.name,
        isActive: false,
        backgroundJobId: job.id,
        outputFile: job.outputFile,
      });
    }
    return terminals;
  }

  private getTerminalOutputFile(terminal: vscode.Terminal): string | undefined {
    const job = TerminalJob.get(terminal);
    if (job) return job.outputFile;
    const id = this.getTerminalId(terminal);
    const history = TerminalHistoryManager.getOrCreate(id);
    return history.hasCapturedCommand ? history.outputFile : undefined;
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
