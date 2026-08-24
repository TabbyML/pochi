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
import * as vscode from "vscode";
import { createTerminal } from "../layout";
import { OutputManager } from "./output";
import { ExecutionError } from "./utils";

const logger = getLogger("TerminalJob");

/**
 * Configuration options for creating a TerminalJob
 */
export interface TerminalJobConfig {
  /** Name of the terminal */
  name: string;
  /** Command to execute in the terminal */
  command: string;
  /** Working directory for the terminal */
  cwd: string;
  /** Location for the terminal */
  location?: vscode.TerminalEditorLocationOptions | undefined;
  /** AbortSignal to cancel the terminal job */
  abortSignal?: AbortSignal;
  /** Task that owns the job and receives its terminal notification. */
  taskId: string;
}

/**
 * A wrapper class around vscode.Terminal that provides enhanced functionality
 * for running commands and managing terminal lifecycle
 */
export class TerminalJob implements vscode.Disposable {
  private static readonly jobs = new Map<string, TerminalJob>();
  private static readonly onDidDisposeEmitter =
    new vscode.EventEmitter<TerminalJob>();
  static readonly onDidDispose = TerminalJob.onDidDisposeEmitter.event;
  private static readonly onDidFinishEmitter =
    new vscode.EventEmitter<BackgroundJobTerminalEvent>();
  static readonly onDidFinish = TerminalJob.onDidFinishEmitter.event;

  private readonly terminal: vscode.Terminal;
  private readonly terminalClosed: Promise<never>;
  private disposables: vscode.Disposable[] = [];
  private closeListener: vscode.Disposable | undefined;
  private rejectTerminalClosed: ((error: ExecutionError) => void) | undefined;
  private disposed = false;
  private shellIntegration: vscode.TerminalShellIntegration | undefined;
  private execution: vscode.TerminalShellExecution | undefined;
  private outputManager: OutputManager;
  private readonly outputWriter: BackgroundJobOutputFile;
  private exitCode: number | undefined;
  private stopRequested = false;
  private finished = false;
  private outputStreamFinished: Promise<void> | undefined;

  readonly id: string;
  readonly outputFile: string;

  get output() {
    return this.outputManager.output;
  }

  get command() {
    return this.config.command;
  }

  private constructor(private readonly config: TerminalJobConfig) {
    this.id = createBackgroundJobId("command");
    this.outputFile = getBackgroundJobOutputPath(config.taskId, this.id);
    this.outputWriter = new BackgroundJobOutputFile(this.outputFile);
    this.outputManager = OutputManager.create({
      id: this.id,
      command: config.command,
    });
    TerminalJob.jobs.set(this.id, this);

    // Create the terminal with the provided configuration
    this.terminal = createTerminal({
      name: config.name,
      cwd: config.cwd,
      location: config.location,
      shellPath: getShellPath(),
      env: getTerminalEnv(),
      iconPath: new vscode.ThemeIcon("piano"),
      hideFromUser: false,
      isTransient: false,
    });

    this.terminalClosed = new Promise<never>((_, reject) => {
      this.rejectTerminalClosed = reject;
    });

    // Keep the terminal and job lifecycle synchronized when the user closes
    // the terminal before execution finishes.
    this.closeListener = vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === this.terminal) {
        this.stopRequested = true;
        this.rejectTerminalClosed?.(
          ExecutionError.create(
            "Background job finished as user closed terminal.",
          ),
        );
        this.rejectTerminalClosed = undefined;
        this.dispose();
      }
    });

    this.terminal.show();

    this.execute();

    logger.info(
      `Created terminal job "${config.name}" with command: ${config.command}`,
    );
  }

  async execute(): Promise<void> {
    let executionError: ExecutionError | undefined;
    try {
      await this.outputWriter.append(`$ ${this.config.command}\n`);

      // Wait for shell integration if not available
      const shellIntegration = await Promise.race([
        this.waitForShellIntegration(),
        this.terminalClosed,
      ]);

      this.execution = shellIntegration.executeCommand(this.config.command);
      logger.debug(
        `Executed command in terminal "${this.config.name}": ${this.config.command}`,
      );
      this.outputStreamFinished = this.processOutputStream(
        this.execution.read(),
      );

      await Promise.race([
        this.waitForExecutionFinish(),
        this.createAbortPromise(),
        this.terminalClosed,
      ]);
      await this.outputStreamFinished;
    } catch (error) {
      if (error instanceof ExecutionError) {
        executionError = error;
      } else {
        executionError = ExecutionError.create(
          `Command execution failed: ${error}`,
        );
      }
    } finally {
      try {
        await this.outputStreamFinished;
      } catch (outputError) {
        executionError = ExecutionError.create(
          outputError instanceof Error
            ? outputError.message
            : String(outputError),
        );
      }
      this.outputManager.finalize(executionError);
      await this.finish(executionError);
      this.cleanupExecution();
    }
  }

  /**
   * Dispose of execution-scoped listeners.
   */
  private cleanupExecution(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }

  /**
   * Creates a promise that rejects when the abort signal is triggered
   */
  private createAbortPromise(): Promise<never> {
    return new Promise<never>((_, reject) => {
      const abortError = ExecutionError.createAbortError();

      // Check if already aborted
      if (this.config.abortSignal?.aborted) {
        reject(abortError);
        return;
      }

      // Set up abort listener
      const abortListener = () => {
        logger.info(`Command execution aborted: ${this.config.command}`);
        this.stopRequested = true;
        this.terminal.dispose();
        reject(abortError);
      };

      this.config.abortSignal?.addEventListener("abort", abortListener, {
        once: true,
      });

      // Clean up timeout if promise chain is resolved elsewhere
      // This is a fallback cleanup mechanism
      const cleanup = () => {
        this.config.abortSignal?.removeEventListener("abort", abortListener);
      };

      // Store cleanup function for potential use in dispose
      this.disposables.push({
        dispose: cleanup,
      });
    });
  }

  /**
   * Processes the output stream and adds lines to the output manager
   */
  private async processOutputStream(
    outputStream: AsyncIterable<string>,
  ): Promise<void> {
    const sanitizer = new PlainOutputSanitizer();
    let pendingReplacementCharacters = "";
    const appendPlainText = async (plainText: string) => {
      if (plainText.length === 0) return;

      const text = pendingReplacementCharacters + plainText;
      const trailingReplacements = text.match(/\uFFFD+$/u)?.[0] ?? "";
      const completeText = text.slice(
        0,
        text.length - trailingReplacements.length,
      );
      pendingReplacementCharacters = trailingReplacements;
      if (completeText.length === 0) return;

      await this.outputWriter.append(completeText);
      this.outputManager.addChunk(completeText);
    };

    for await (const chunk of outputStream) {
      await appendPlainText(sanitizer.write(chunk));
    }
    await appendPlainText(sanitizer.end());

    // VS Code exposes terminal output as decoded strings, so the original
    // bytes are unavailable here. If terminal disposal interrupted a UTF-8
    // sequence, its decoder can leave U+FFFD at the very end of the stream.
    // Hold that trailing marker until completion and discard it only when the
    // job was stopped. A naturally completed job still preserves U+FFFD.
    if (!this.stopRequested && pendingReplacementCharacters.length > 0) {
      await this.outputWriter.append(pendingReplacementCharacters);
      this.outputManager.addChunk(pendingReplacementCharacters);
    }
  }

  /**
   * Kills the terminal job.
   */
  kill(): void {
    this.stopRequested = true;
    this.terminal.dispose();
  }

  /**
   * Dispose of the terminal and clean up resources
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    TerminalJob.jobs.delete(this.id);
    TerminalJob.onDidDisposeEmitter.fire(this);

    this.closeListener?.dispose();
    this.closeListener = undefined;

    this.cleanupExecution();

    logger.debug(`Disposed terminal job "${this.config.name}"`);
  }

  /**
   * Wait for shell integration to become available
   */
  private async waitForShellIntegration(
    timeoutMs = 15000,
  ): Promise<vscode.TerminalShellIntegration> {
    if (this.terminal.shellIntegration) {
      this.shellIntegration = this.terminal.shellIntegration;
      return this.shellIntegration;
    }

    return new Promise<vscode.TerminalShellIntegration>((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        listener.dispose();
        reject(new Error("Timeout waiting for shell integration"));
      }, timeoutMs);

      // Set up event listener for shell integration
      const listener = vscode.window.onDidChangeTerminalShellIntegration(
        ({ terminal, shellIntegration }) => {
          if (terminal === this.terminal) {
            logger.debug("Terminal shell integration acquired");
            this.shellIntegration = shellIntegration;

            // Clean up and resolve
            clearTimeout(timeout);
            listener.dispose();
            resolve(shellIntegration);
          }
        },
      );
    });
  }

  private waitForExecutionFinish(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Listen for shell execution end.
      this.disposables.push(
        vscode.window.onDidEndTerminalShellExecution((event) => {
          if (event.execution === this.execution) {
            logger.debug("Terminal shell execution ended", event.exitCode);
            this.exitCode = event.exitCode;
            if (event.exitCode === undefined) {
              reject(
                ExecutionError.create(
                  "Background job execution finished with unknown exit code.",
                ),
              );
            } else if (event.exitCode !== 0) {
              reject(
                ExecutionError.create(
                  `Background job execution exited with code ${event.exitCode}.`,
                ),
              );
            } else {
              resolve();
            }
          }
        }),
      );
    });
  }

  /**
   * Create a new TerminalJob instance
   */
  static create(config: TerminalJobConfig): TerminalJob {
    return new TerminalJob(config);
  }

  /**
   * Retrieves a `TerminalJob` instance by its ID.
   *
   * @param id - The ID of the job or the terminal instance.
   * @returns The `TerminalJob` instance, or `undefined` if not found.
   */
  static get(id: string | vscode.Terminal): TerminalJob | undefined {
    return typeof id === "string"
      ? TerminalJob.jobs.get(id)
      : Array.from(TerminalJob.jobs.values()).find(
          (job) => job.terminal === id,
        );
  }

  private async finish(error?: ExecutionError): Promise<void> {
    if (this.finished) return;
    this.finished = true;

    let finalError = error;
    try {
      await this.outputWriter.close();
    } catch (closeError) {
      finalError = ExecutionError.create(
        closeError instanceof Error ? closeError.message : String(closeError),
      );
    }

    const status =
      this.stopRequested || finalError?.aborted
        ? "stopped"
        : this.exitCode === 0 && !finalError
          ? "completed"
          : "failed";
    TerminalJob.onDidFinishEmitter.fire({
      taskId: this.config.taskId,
      backgroundJobId: this.id,
      outputFile: this.outputFile,
      status,
      command: this.config.command,
      ...(this.exitCode !== undefined ? { exitCode: this.exitCode } : {}),
      ...(finalError ? { error: finalError.message } : {}),
      finishedAt: Date.now(),
    });

    if (!this.disposed) {
      this.terminal.dispose();
      this.dispose();
    }
  }
}
