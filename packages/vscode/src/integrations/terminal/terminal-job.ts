import { getLogger } from "@/lib/logger";
import type { BackgroundJobTerminalEvent } from "@getpochi/common";
import { getTerminalEnv } from "@getpochi/common/env-utils";
import {
  BackgroundJobOutputFile,
  PlainOutputSanitizer,
  createBackgroundJobId,
  getBackgroundJobOutputPath,
  getShellPath,
} from "@getpochi/common/tool-utils";
import { signal } from "@preact/signals-core";
import * as vscode from "vscode";
import { createTerminal } from "../layout";
import { OutputManager } from "./output";
import { PtyProcess, PtySpawnError } from "./pty-process";
import { PtyTerminal } from "./pty-terminal";
import { ExecutionError } from "./utils";

const logger = getLogger("TerminalJob");

export interface TerminalJobConfig {
  name: string;
  command: string;
  cwd: string;
  location?: vscode.TerminalEditorLocationOptions;
  abortSignal?: AbortSignal;
  taskId: string;
  envs?: Record<string, string>;
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

  private terminal: vscode.Terminal | undefined;
  private ptyTerminal: PtyTerminal | undefined;
  private outputManager!: OutputManager;
  private outputWriter!: BackgroundJobOutputFile;
  private readonly sanitizer = new PlainOutputSanitizer();
  private readonly disposables: vscode.Disposable[] = [];
  private outputQueue: Promise<void> = Promise.resolve();
  private pendingTerminalSuffix = "";
  private persistenceError: ExecutionError | undefined;
  private stopRequested = false;
  private ptyExited = false;
  private finished = false;
  private disposed = false;
  private shellExecution: vscode.TerminalShellExecution | undefined;
  private terminalCloseError: ExecutionError | undefined;
  private readonly terminalCloseRejectors = new Set<
    (error: ExecutionError) => void
  >();

  readonly id: string;
  readonly outputFile: string;
  readonly terminalVisibility = signal(false);

  get output() {
    return this.outputManager.output;
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

  private constructor(
    private readonly config: TerminalJobConfig,
    private readonly ptyProcess?: PtyProcess,
  ) {
    this.id = createBackgroundJobId("command");
    this.outputFile = getBackgroundJobOutputPath(config.taskId, this.id);

    try {
      this.outputWriter = new BackgroundJobOutputFile(this.outputFile);
      this.outputManager = OutputManager.create({
        id: this.id,
        command: config.command,
      });
      TerminalJob.jobs.set(this.id, this);
      this.enqueueFileOutput(`$ ${config.command}\n`, false);
      if (ptyProcess) {
        this.initializePtyTerminal(ptyProcess);
      } else {
        this.initializeShellTerminal();
      }
      this.initializeLifecycle();
      if (!this.stopRequested) {
        if (!ptyProcess) {
          void this.executeWithShellIntegration();
        }
      } else if (!ptyProcess) {
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
    // Preserve the shell-integration implementation on Windows, where the
    // extension's node-pty foreground implementation is not supported yet.
    if (process.platform !== "win32") {
      try {
        const ptyProcess = await PtyProcess.spawn({
          command: config.command,
          cwd: config.cwd,
          envs: config.envs,
        });
        return TerminalJob.adopt(ptyProcess, config);
      } catch (error) {
        if (!(error instanceof PtySpawnError)) throw error;
        logger.warn(
          "Failed to spawn background pty; falling back to shell integration",
          error.cause,
        );
      }
    }
    return new TerminalJob(config);
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
    if (this.ptyProcess && !this.terminal) {
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
      ptyProcess.onExit(({ exitCode }) => {
        void this.finalize(exitCode);
      }),
    );
  }

  private createPtyTerminalView(): void {
    if (!this.ptyProcess || this.terminal) return;
    const ptyTerminal = new PtyTerminal(this.ptyProcess, () => {
      this.detachPtyTerminalView(ptyTerminal);
    });
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

  private initializeShellTerminal(): void {
    this.terminal = createTerminal({
      name: this.config.name,
      cwd: this.config.cwd,
      location: this.config.location,
      shellPath: getShellPath(),
      env: {
        ...this.config.envs,
        ...getTerminalEnv(),
      },
      iconPath: new vscode.ThemeIcon("piano"),
      hideFromUser: false,
      isTransient: false,
    });
  }

  private initializeLifecycle(): void {
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        if (terminal !== this.terminal || this.finished) return;
        if (this.ptyProcess) {
          if (!this.ptyExited) this.detachPtyTerminalView();
          return;
        }

        this.stopRequested = true;
        this.terminalCloseError = ExecutionError.create(
          "Background job finished as user closed terminal.",
        );
        for (const reject of this.terminalCloseRejectors) {
          reject(this.terminalCloseError);
        }
        this.terminalCloseRejectors.clear();
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

  private async executeWithShellIntegration(): Promise<void> {
    let executionError: ExecutionError | undefined;
    let outputError: ExecutionError | undefined;
    let outputFinished: Promise<void> | undefined;
    let exitCode: number | undefined;
    try {
      const shellIntegration = await Promise.race([
        this.waitForShellIntegration(),
        this.waitForTerminalClose(),
      ]);
      if (this.stopRequested) {
        throw ExecutionError.createAbortError();
      }
      this.shellExecution = shellIntegration.executeCommand(
        this.config.command,
      );
      outputFinished = this.processShellOutput(
        this.shellExecution.read(),
      ).catch((error) => {
        outputError =
          error instanceof ExecutionError
            ? error
            : ExecutionError.create(`Failed to read command output: ${error}`);
      });
      exitCode = await Promise.race([
        this.waitForShellExecutionFinish(),
        this.waitForAbort(),
        this.waitForTerminalClose(),
      ]);
    } catch (error) {
      executionError =
        error instanceof ExecutionError
          ? error
          : ExecutionError.create(`Command execution failed: ${error}`);
    } finally {
      await outputFinished;
    }
    executionError ??= outputError;
    await this.finalize(exitCode, executionError);
  }

  private async processShellOutput(
    output: AsyncIterable<string>,
  ): Promise<void> {
    for await (const chunk of output) {
      this.enqueueRawOutput(chunk);
    }
  }

  private waitForShellIntegration(
    timeoutMs = 15_000,
  ): Promise<vscode.TerminalShellIntegration> {
    if (this.terminal?.shellIntegration) {
      return Promise.resolve(this.terminal.shellIntegration);
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        listener.dispose();
        reject(new Error("Timeout waiting for shell integration"));
      }, timeoutMs);
      const listener = vscode.window.onDidChangeTerminalShellIntegration(
        ({ terminal, shellIntegration }) => {
          if (terminal !== this.terminal) return;
          clearTimeout(timeout);
          listener.dispose();
          resolve(shellIntegration);
        },
      );
      this.disposables.push({ dispose: () => clearTimeout(timeout) }, listener);
    });
  }

  private waitForShellExecutionFinish(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.disposables.push(
        vscode.window.onDidEndTerminalShellExecution((event) => {
          if (event.execution !== this.shellExecution) return;
          if (event.exitCode === undefined) {
            reject(
              ExecutionError.create(
                "Background job execution finished with unknown exit code.",
              ),
            );
          } else {
            resolve(event.exitCode);
          }
        }),
      );
    });
  }

  private waitForAbort(): Promise<never> {
    return new Promise((_, reject) => {
      const onAbort = () => reject(ExecutionError.createAbortError());
      if (this.config.abortSignal?.aborted) {
        onAbort();
        return;
      }
      this.config.abortSignal?.addEventListener("abort", onAbort, {
        once: true,
      });
      this.disposables.push({
        dispose: () =>
          this.config.abortSignal?.removeEventListener("abort", onAbort),
      });
    });
  }

  private waitForTerminalClose(): Promise<never> {
    if (this.terminalCloseError) {
      return Promise.reject(this.terminalCloseError);
    }
    return new Promise((_, reject) => {
      this.terminalCloseRejectors.add(reject);
    });
  }

  private requestStop(reason: string): void {
    if (this.finished || this.stopRequested) return;
    this.stopRequested = true;
    logger.info(`Stopping terminal job ${this.id}: ${reason}`);
    if (this.ptyProcess) {
      this.ptyProcess.kill();
    } else {
      this.terminal?.dispose();
    }
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
    this.enqueueFileOutput(completeText, true);
  }

  private enqueueFileOutput(text: string, addToManager: boolean): void {
    if (text.length === 0 || this.persistenceError) return;
    const write = this.outputQueue.then(async () => {
      await this.outputWriter.append(text);
      if (addToManager) this.outputManager.addChunk(text);
    });
    this.outputQueue = write.catch((error) => {
      if (this.persistenceError) return;
      this.persistenceError = ExecutionError.create(
        error instanceof Error ? error.message : String(error),
      );
      this.requestStop("background output persistence failed");
    });
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
    this.terminalCloseRejectors.clear();
    this.terminal?.dispose();
    this.terminal = undefined;
    this.ptyTerminal?.dispose();
    this.ptyTerminal = undefined;
    this.setVisible(false);

    let executionError = initialError ?? this.persistenceError;
    if (exitCode !== undefined && exitCode !== 0 && !this.stopRequested) {
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
      this.enqueueFileOutput(finalSuffix, true);
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

    const status =
      this.stopRequested || executionError?.aborted
        ? "stopped"
        : exitCode === 0 && !executionError
          ? "completed"
          : "failed";
    TerminalJob.onDidFinishEmitter.fire({
      taskId: this.config.taskId,
      backgroundJobId: this.id,
      outputFile: this.outputFile,
      status,
      command: this.config.command,
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(executionError ? { error: executionError.message } : {}),
      finishedAt: Date.now(),
    });

    this.dispose();
  }

  private cleanupAfterInitializationFailure(): void {
    TerminalJob.jobs.delete(this.id);
    OutputManager.delete(this.id);
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.terminalCloseRejectors.clear();
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
