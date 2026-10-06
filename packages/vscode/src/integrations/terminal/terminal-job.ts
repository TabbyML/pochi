import type { ChildProcess } from "node:child_process";
import { constants as osConstants } from "node:os";
import { StringDecoder } from "node:string_decoder";
import { getLogger } from "@/lib/logger";
import {
  type BackgroundJobTerminalEvent,
  type BackgroundMonitorNotification,
  type MonitorJobOptions,
  MonitorWatcher,
} from "@getpochi/common";
import {
  BackgroundJobOutputFile,
  PlainOutputSanitizer,
  createBackgroundJobId,
  getBackgroundJobOutputPath,
} from "@getpochi/common/tool-utils";
import { signal } from "@preact/signals-core";
import * as vscode from "vscode";
import { createTerminal } from "../layout";
import {
  spawnBackgroundChildProcess,
  terminateChildProcessTree,
} from "./background-child-process";
import { OutputManager } from "./output";
import { PtyProcess, PtySpawnError } from "./pty-process";
import { PtyTerminal } from "./pty-terminal";
import { ExecutionError } from "./utils";

const logger = getLogger("TerminalJob");
const OutputPauseThresholdCharacters = 1024 * 1024;
const OutputResumeThresholdCharacters = OutputPauseThresholdCharacters / 2;

export interface TerminalJobConfig {
  name: string;
  command: string;
  cwd: string;
  location?: vscode.TerminalEditorLocationOptions;
  abortSignal?: AbortSignal;
  taskId: string;
  envs?: Record<string, string>;
  monitor?: MonitorJobOptions;
}

export class TerminalJob implements vscode.Disposable {
  private static readonly jobs = new Map<string, TerminalJob>();
  private static readonly onDidCreateEmitter =
    new vscode.EventEmitter<TerminalJob>();
  static readonly onDidCreate = TerminalJob.onDidCreateEmitter.event;
  private static readonly onDidDisposeEmitter =
    new vscode.EventEmitter<TerminalJob>();
  static readonly onDidDispose = TerminalJob.onDidDisposeEmitter.event;
  private static readonly onDidFinishEmitter =
    new vscode.EventEmitter<BackgroundJobTerminalEvent>();
  static readonly onDidFinish = TerminalJob.onDidFinishEmitter.event;
  private static readonly onDidChangeVisibilityEmitter =
    new vscode.EventEmitter<TerminalJob>();
  static readonly onDidChangeVisibility =
    TerminalJob.onDidChangeVisibilityEmitter.event;

  private static readonly onDidMonitorEventEmitter = new vscode.EventEmitter<{
    taskId: string;
    event: BackgroundMonitorNotification;
  }>();
  static readonly onDidMonitorEvent =
    TerminalJob.onDidMonitorEventEmitter.event;
  private monitorWatcher: MonitorWatcher | undefined;
  private monitorEndReason: string | undefined;
  /** Process group/tree cleanup that must finish before the job reports. */
  private termination: Promise<void> | undefined;

  get monitorDescription() {
    return this.config.monitor?.description;
  }

  private terminal: vscode.Terminal | undefined;
  private ptyTerminal: PtyTerminal | undefined;
  private outputManager!: OutputManager;
  private outputWriter!: BackgroundJobOutputFile;
  private readonly sanitizer = new PlainOutputSanitizer();
  private readonly disposables: vscode.Disposable[] = [];
  private outputQueue: Promise<void> = Promise.resolve();
  private pendingOutputCharacters = 0;
  private outputPaused = false;
  private pendingTerminalSuffix = "";
  private persistenceError: ExecutionError | undefined;
  private stopRequested = false;
  private ptyExited = false;
  private finished = false;
  private disposed = false;

  readonly id: string;
  readonly outputFile: string;
  readonly terminalVisibility = signal(false);

  get output() {
    return this.outputManager.output;
  }

  get taskId() {
    return this.config.taskId;
  }

  get command() {
    return this.config.command;
  }

  get name() {
    return this.config.name;
  }

  get isPtyTerminal() {
    return this.ptyProcess !== undefined;
  }

  get isFinished() {
    return this.finished;
  }

  get isVisible() {
    return this.terminalVisibility.value;
  }

  /**
   * A job runs on either a pty (detachable terminal view) or a plain child
   * process (output file only). With neither, the job was aborted before
   * anything started and finishes as stopped.
   */
  private constructor(
    private readonly config: TerminalJobConfig,
    private readonly ptyProcess?: PtyProcess,
    private readonly childProcess?: ChildProcess,
  ) {
    this.id = createBackgroundJobId(config.monitor ? "monitor" : "command");
    this.outputFile = getBackgroundJobOutputPath(config.taskId, this.id);

    try {
      if (config.monitor) {
        this.monitorWatcher = new MonitorWatcher({
          onEvents: (lines, omittedLines) =>
            this.emitMonitorEvent(lines, undefined, omittedLines),
          onTimeout: () => {
            this.monitorEndReason = "killed after timeout";
            this.kill();
          },
          timeoutMs: config.monitor.timeoutMs,
        });
      }
      this.outputWriter = new BackgroundJobOutputFile(this.outputFile);
      this.outputManager = OutputManager.create({
        id: this.id,
        command: config.command,
      });
      TerminalJob.jobs.set(this.id, this);
      // The echoed command is part of the readable output so the in-memory
      // manager stays consistent with the persisted log file.
      this.enqueueOutput(`$ ${config.command}\n`, false);
      if (ptyProcess) {
        this.initializePtyTerminal(ptyProcess);
      } else if (childProcess) {
        this.initializeChildProcess(childProcess);
      }
      this.initializeLifecycle();
      if (!ptyProcess && !childProcess) {
        void this.finalize(undefined, ExecutionError.createAbortError());
      }
    } catch (error) {
      this.cleanupAfterInitializationFailure();
      throw error;
    }

    TerminalJob.onDidCreateEmitter.fire(this);
    logger.info(
      `Created terminal job "${config.name}" with command: ${config.command}`,
    );
  }

  static async create(config: TerminalJobConfig): Promise<TerminalJob> {
    // The extension's node-pty implementation is not supported on Windows yet,
    // so commands there run as a plain child process without a terminal view.
    if (process.platform !== "win32") {
      try {
        const ptyProcess = await PtyProcess.spawn({
          command: config.command,
          cwd: config.cwd,
          envs: config.envs,
          abortSignal: config.abortSignal,
        });
        return TerminalJob.adopt(ptyProcess, config);
      } catch (error) {
        if (!(error instanceof PtySpawnError)) throw error;
        logger.warn(
          "Failed to spawn background pty; falling back to child_process",
          error.cause,
        );
      }
    }
    if (config.abortSignal?.aborted) return new TerminalJob(config);

    const childProcess = spawnBackgroundChildProcess({
      command: config.command,
      cwd: config.cwd,
      envs: config.envs,
    });
    try {
      return new TerminalJob(config, undefined, childProcess);
    } catch (error) {
      void terminateChildProcessTree(childProcess).catch((killError) => {
        logger.warn("Failed to stop background child process", killError);
      });
      throw error;
    }
  }

  static adopt(ptyProcess: PtyProcess, config: TerminalJobConfig): TerminalJob {
    try {
      return new TerminalJob(config, ptyProcess);
    } catch (error) {
      ptyProcess.kill("SIGKILL");
      throw error;
    }
  }

  static get(id: string | vscode.Terminal): TerminalJob | undefined {
    return typeof id === "string"
      ? TerminalJob.jobs.get(id)
      : Array.from(TerminalJob.jobs.values()).find(
          (job) => job.terminal === id,
        );
  }

  static list(): readonly TerminalJob[] {
    return Array.from(TerminalJob.jobs.values());
  }

  show(): void {
    if (this.finished || this.stopRequested) return;
    if (!this.ptyProcess) {
      // Without a pty there is no terminal view; show the live output file.
      vscode.window
        .showTextDocument(vscode.Uri.file(this.outputFile), { preview: false })
        .then(undefined, (error) => {
          logger.warn(
            `Failed to open output of terminal job ${this.id}`,
            error,
          );
        });
      return;
    }
    if (!this.terminal) {
      this.createPtyTerminalView();
    }
    this.terminal?.show(false);
    this.setVisible(true);
  }

  hide(): void {
    if (!this.ptyProcess || !this.terminal) return;
    const terminal = this.terminal;
    const ptyTerminal = this.ptyTerminal;
    this.terminal = undefined;
    this.ptyTerminal = undefined;
    this.setVisible(false);
    terminal.dispose();
    ptyTerminal?.dispose();
  }

  closePtyProcess(): void {
    if (!this.ptyProcess) return;
    this.hide();
    this.requestStop("close requested");
  }

  kill(): void {
    this.requestStop("kill requested");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.monitorWatcher?.dispose();
    TerminalJob.jobs.delete(this.id);
    OutputManager.delete(this.id);
    TerminalJob.onDidDisposeEmitter.fire(this);
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    logger.debug(`Disposed terminal job "${this.config.name}"`);
  }

  private initializePtyTerminal(ptyProcess: PtyProcess): void {
    const outputSubscription = ptyProcess.subscribeWithReplay((data) => {
      this.enqueueRawOutput(data);
    });
    this.disposables.push(outputSubscription.disposable);
    for (const data of outputSubscription.replay) {
      this.enqueueRawOutput(data);
    }

    // This listener is registered before PtyTerminal's close listener so a
    // process-driven terminal close is not mistaken for a user action.
    this.disposables.push(
      ptyProcess.onExit(() => {
        this.ptyExited = true;
      }),
    );

    this.disposables.push(
      ptyProcess.onExit(({ exitCode, signal }) => {
        const effectiveExitCode =
          signal !== undefined && signal > 0 ? 128 + signal : exitCode;
        const signalError =
          signal !== undefined && signal > 0 && !this.stopRequested
            ? ExecutionError.create(
                `Background job execution terminated by signal ${signal}.`,
              )
            : undefined;
        void this.finalize(effectiveExitCode, signalError);
      }),
    );
  }

  private createPtyTerminalView(): void {
    if (!this.ptyProcess || this.terminal) return;
    const ptyTerminal = new PtyTerminal(
      this.ptyProcess,
      () => {
        this.detachPtyTerminalView(ptyTerminal);
      },
      this.config.command,
    );
    this.ptyTerminal = ptyTerminal;
    try {
      this.terminal = createTerminal({
        name: this.config.name,
        pty: ptyTerminal,
        location: this.config.location,
        iconPath: new vscode.ThemeIcon("piano"),
        isTransient: false,
      });
    } catch (error) {
      this.ptyTerminal = undefined;
      ptyTerminal.dispose();
      throw error;
    }
  }

  private detachPtyTerminalView(ptyTerminal?: PtyTerminal): void {
    if (
      this.finished ||
      this.ptyExited ||
      (ptyTerminal && ptyTerminal !== this.ptyTerminal)
    ) {
      return;
    }
    const attachedPtyTerminal = ptyTerminal ?? this.ptyTerminal;
    this.terminal = undefined;
    this.ptyTerminal = undefined;
    attachedPtyTerminal?.dispose();
    this.setVisible(false);
  }

  private setVisible(isVisible: boolean): void {
    if (this.terminalVisibility.value === isVisible) return;
    this.terminalVisibility.value = isVisible;
    TerminalJob.onDidChangeVisibilityEmitter.fire(this);
  }

  private initializeChildProcess(childProcess: ChildProcess): void {
    // Decode each stream separately so a multi-byte character split across
    // chunks is not corrupted.
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    childProcess.stdout?.on("data", (chunk: Buffer) => {
      this.enqueueRawOutput(stdoutDecoder.write(chunk));
    });
    childProcess.stderr?.on("data", (chunk: Buffer) => {
      this.enqueueRawOutput(stderrDecoder.write(chunk));
    });

    // "close" fires after both pipes have ended, so all output was delivered.
    childProcess.once("close", (code, signal) => {
      // A stopped process may end in the middle of a character. Discard that
      // partial sequence instead of flushing it as U+FFFD.
      if (!this.stopRequested) {
        this.enqueueRawOutput(stdoutDecoder.end() + stderrDecoder.end());
      }
      const signalNumber = signal ? osConstants.signals[signal] : undefined;
      const exitCode =
        code ?? (signalNumber !== undefined ? 128 + signalNumber : undefined);
      const signalError =
        signal && !this.stopRequested
          ? ExecutionError.create(
              `Background job execution terminated by signal ${signal}.`,
            )
          : undefined;
      void this.finalize(exitCode, signalError);
    });
    childProcess.once("error", (error) => {
      void this.finalize(
        undefined,
        ExecutionError.create(`Command execution failed: ${error.message}`),
      );
    });
  }

  private initializeLifecycle(): void {
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        // Only pty jobs have a terminal. Closing it detaches the view and
        // keeps the command running.
        if (terminal !== this.terminal || this.finished || this.ptyExited) {
          return;
        }
        this.detachPtyTerminalView();
      }),
    );

    const onAbort = () => this.requestStop("abort signal");
    if (this.config.abortSignal?.aborted) {
      onAbort();
    } else if (this.config.abortSignal) {
      this.config.abortSignal.addEventListener("abort", onAbort, {
        once: true,
      });
      this.disposables.push({
        dispose: () =>
          this.config.abortSignal?.removeEventListener("abort", onAbort),
      });
    }
  }

  private requestStop(reason: string): void {
    if (this.finished || this.stopRequested) return;
    this.stopRequested = true;
    this.monitorEndReason ??= reason;
    logger.info(`Stopping terminal job ${this.id}: ${reason}`);
    if (this.ptyProcess) {
      if (this.monitorWatcher) {
        this.termination = this.ptyProcess.killProcessGroup();
      } else {
        this.ptyProcess.kill();
      }
    } else if (this.childProcess) {
      // Stopping only the shell would orphan the command's descendants, which
      // is common on Windows where cmd.exe does not forward termination.
      this.termination = terminateChildProcessTree(this.childProcess);
    }
    // A failed signal can leave the shell alive, so report the failure
    // without relying on its exit callback to finalize the job.
    void this.termination?.catch(() => this.finalize(undefined));
  }

  private enqueueRawOutput(data: string): void {
    if (this.persistenceError) return;
    this.enqueuePlainOutput(this.sanitizer.write(data));
  }

  private enqueuePlainOutput(plainText: string): void {
    if (plainText.length === 0 || this.persistenceError) return;
    const text = this.pendingTerminalSuffix + plainText;
    const trailingTerminalSuffix =
      text.match(/\uFFFD+(?:\^C[ \t\r\n]*|\^)?$/u)?.[0] ?? "";
    const completeText = text.slice(
      0,
      text.length - trailingTerminalSuffix.length,
    );
    this.pendingTerminalSuffix = trailingTerminalSuffix;
    this.enqueueOutput(completeText);
  }

  private enqueueOutput(text: string, monitorOutput = true): void {
    if (text.length === 0 || this.persistenceError) return;
    this.pendingOutputCharacters += text.length;
    this.updateOutputFlowControl();
    const write = this.outputQueue.then(async () => {
      await this.outputWriter.append(text);
      this.outputManager.addChunk(text);
      if (monitorOutput) this.monitorWatcher?.ingest(text);
    });
    this.outputQueue = write
      .catch((error) => {
        if (this.persistenceError) return;
        this.persistenceError = ExecutionError.create(
          error instanceof Error ? error.message : String(error),
        );
        this.requestStop("background output persistence failed");
      })
      .finally(() => {
        this.pendingOutputCharacters = Math.max(
          0,
          this.pendingOutputCharacters - text.length,
        );
        this.updateOutputFlowControl();
      });
  }

  private updateOutputFlowControl(): void {
    if (
      !this.outputPaused &&
      this.pendingOutputCharacters >= OutputPauseThresholdCharacters
    ) {
      this.outputPaused = true;
      this.ptyProcess?.pauseOutput();
      this.childProcess?.stdout?.pause();
      this.childProcess?.stderr?.pause();
      return;
    }
    if (
      this.outputPaused &&
      this.pendingOutputCharacters <= OutputResumeThresholdCharacters &&
      // A child process only emits "close" once its pipes are drained, so
      // keep draining them after a stop or persistence failure.
      (this.childProcess ||
        (!this.stopRequested && !this.finished && !this.persistenceError))
    ) {
      this.outputPaused = false;
      this.ptyProcess?.resumeOutput();
      this.childProcess?.stdout?.resume();
      this.childProcess?.stderr?.resume();
    }
  }

  private async finalize(
    exitCode: number | undefined,
    initialError?: ExecutionError,
  ): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.terminal?.dispose();
    this.terminal = undefined;
    this.ptyTerminal?.dispose();
    this.ptyTerminal = undefined;
    this.setVisible(false);

    let executionError = initialError ?? this.persistenceError;
    let terminationFailed = false;
    try {
      // Shell exit does not imply group exit. Finish the group's TERM grace
      // period and escalation before closing its transcript or reporting stop.
      await this.termination;
    } catch (error) {
      terminationFailed = true;
      executionError = ExecutionError.create(
        error instanceof Error ? error.message : String(error),
      );
    }
    if (
      exitCode !== undefined &&
      exitCode !== 0 &&
      !this.stopRequested &&
      !executionError
    ) {
      executionError = ExecutionError.create(
        `Background job execution exited with code ${exitCode}.`,
      );
    }

    if (!this.persistenceError) {
      this.enqueuePlainOutput(this.sanitizer.end());
      const finalSuffix =
        this.stopRequested || exitCode === 130
          ? this.pendingTerminalSuffix.replace(/\uFFFD+/gu, "")
          : this.pendingTerminalSuffix;
      this.pendingTerminalSuffix = "";
      this.enqueueOutput(finalSuffix);
    }
    await this.outputQueue;
    executionError ??= this.persistenceError;

    try {
      await this.outputWriter.close();
    } catch (error) {
      executionError = ExecutionError.create(
        error instanceof Error ? error.message : String(error),
      );
    }
    this.outputManager.finalize(executionError);

    const status = terminationFailed
      ? "failed"
      : this.stopRequested || executionError?.aborted
        ? "stopped"
        : exitCode === 0 && !executionError
          ? "completed"
          : "failed";
    const event: BackgroundJobTerminalEvent = {
      taskId: this.config.taskId,
      backgroundJobId: this.id,
      outputFile: this.outputFile,
      status,
      command: this.config.command,
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(executionError ? { error: executionError.message } : {}),
      finishedAt: Date.now(),
    };
    if (this.monitorWatcher) {
      this.monitorWatcher.end();
      this.emitMonitorEvent([], {
        reason:
          executionError?.message ??
          this.monitorEndReason ??
          `exited with code ${exitCode ?? "unknown"}`,
        status,
        ...(exitCode !== undefined ? { exitCode } : {}),
      });
    } else {
      TerminalJob.onDidFinishEmitter.fire(event);
    }

    this.dispose();
  }

  private emitMonitorEvent(
    lines: string[],
    ended?: BackgroundMonitorNotification["ended"],
    omittedLines?: number,
  ): void {
    const description = this.config.monitor?.description;
    if (description === undefined) return;
    TerminalJob.onDidMonitorEventEmitter.fire({
      taskId: this.config.taskId,
      event: {
        kind: "monitor",
        notificationId: crypto.randomUUID(),
        backgroundJobId: this.id,
        command: this.command,
        outputFile: this.outputFile,
        description,
        lines,
        ...(ended ? { ended } : {}),
        ...(omittedLines ? { omittedLines } : {}),
      },
    });
  }

  private cleanupAfterInitializationFailure(): void {
    this.monitorWatcher?.dispose();
    TerminalJob.jobs.delete(this.id);
    OutputManager.delete(this.id);
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.terminal?.dispose();
    this.ptyTerminal?.dispose();
    if (this.outputWriter) {
      void this.outputQueue
        .finally(() => this.outputWriter.close())
        .catch(() => {});
    }
    this.ptyProcess?.kill("SIGKILL");
  }
}
