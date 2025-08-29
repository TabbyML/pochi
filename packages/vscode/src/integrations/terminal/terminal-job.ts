import { randomUUID } from "node:crypto";
import { getLogger } from "@/lib/logger";
import { getShellPath } from "@getpochi/common/tool-utils";
import * as vscode from "vscode";
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
  /** AbortSignal to cancel the terminal job */
  abortSignal?: AbortSignal;
  /** Background job configuration - detached by default and auto-completes after 5s of no output */
  background?: boolean;
  /** timeout in seconds for the command execution */
  timeout?: number;
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

  private readonly terminal: vscode.Terminal;
  private disposables: vscode.Disposable[] = [];
  private shellIntegration: vscode.TerminalShellIntegration | undefined;
  private execution: vscode.TerminalShellExecution | undefined;
  private outputManager: OutputManager;
  private detached = false;

  readonly id: string;

  get output() {
    return this.outputManager.output;
  }

  get command() {
    return this.config.command;
  }

  detach = () => {
    this.detached = true;
  };

  private constructor(private readonly config: TerminalJobConfig) {
    this.id = `bgjob-${randomUUID()}`;
    this.outputManager = OutputManager.create({
      id: this.id,
      command: config.command,
    });
    TerminalJob.jobs.set(this.id, this);

    // For background jobs, detach by default
    if (config.background) {
      this.detached = true;
    }

    // Create the terminal with the provided configuration
    this.terminal = vscode.window.createTerminal({
      name: config.name,
      cwd: config.cwd,
      shellPath: getShellPath(),
      env: {
        PAGER: "cat",
        GIT_COMMITTER_NAME: "Pochi",
        GIT_COMMITTER_EMAIL: "noreply@getpochi.com",
      },
      iconPath: new vscode.ThemeIcon("piano"),
      hideFromUser: !this.detached,
      isTransient: false,
    });

    if (this.detached) {
      this.terminal.show();
    }

    // Set up event listeners
    this.setupEventListeners();

    this.execute();

    logger.info(
      `Created ${config.background ? "background " : ""}terminal job "${config.name}" with command: ${config.command}`,
    );
  }

  /**
   * Execute the configured command in the terminal
   */
  async execute(): Promise<void> {
    let executeError: ExecutionError | undefined = undefined;

    try {
      await this.executeImpl();
    } catch (err) {
      if (err instanceof ExecutionError) {
        executeError = err;
      } else {
        executeError = ExecutionError.create(
          `Command execution failed: ${err}`,
        );
      }
    } finally {
      this.outputManager.finalize(this.detached, executeError);

      if (!this.detached) {
        this.terminal.dispose();
      } else {
        this.terminal.show();
      }

      if (!this.config.background) {
        this.dispose();
      }
    }
  }

  /**
   * Internal implementation of command execution with abort handling
   */
  private async executeImpl(): Promise<void> {
    // Wait for shell integration if not available
    const shellIntegration = await this.waitForShellIntegration();

    this.execution = shellIntegration.executeCommand(this.config.command);
    logger.debug(
      `Executed command in terminal "${this.config.name}": ${this.config.command}`,
    );

    try {
      // Use Promise.race to handle abort signal, timeout, and stream processing
      await Promise.race([
        this.processOutputStream(this.execution.read()),
        this.createAbortAndTimeoutPromise(),
      ]);
    } catch (error) {
      // Re-throw ExecutionError as-is, wrap other errors
      if (error instanceof ExecutionError) {
        throw error;
      }
      throw ExecutionError.create(`Command execution failed: ${error}`);
    }
  }

  /**
   * Creates a promise that rejects when the abort signal is triggered or timeout is reached
   */
  private createAbortAndTimeoutPromise(): Promise<never> {
    return new Promise<never>((_, reject) => {
      const abortError = ExecutionError.createAbortError();

      // Check if already aborted
      if (this.config.abortSignal?.aborted) {
        reject(abortError);
        return;
      }

      // Set up timeout
      const timeoutId = this.config.timeout
        ? setTimeout(() => {
            logger.info(
              `Command execution timed out after ${this.config.timeout}s: ${this.config.command}`,
            );
            const timeoutError = ExecutionError.createTimeoutError(
              this.config.timeout ?? 0,
            );
            reject(timeoutError);
          }, this.config.timeout * 1000)
        : undefined;

      // Set up abort listener
      const abortListener = () => {
        clearTimeout(timeoutId);
        logger.info(`Command execution aborted: ${this.config.command}`);
        reject(abortError);
      };

      this.config.abortSignal?.addEventListener("abort", abortListener, {
        once: true,
      });

      // Clean up timeout if promise chain is resolved elsewhere
      // This is a fallback cleanup mechanism
      const cleanup = () => {
        clearTimeout(timeoutId);
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
    for await (const chunk of outputStream) {
      this.outputManager.addChunk(chunk);
    }
  }

  /**
   * Kills the terminal job.
   */
  kill(): void {
    this.terminal.dispose();
  }

  /**
   * Dispose of the terminal and clean up resources
   */
  dispose(): void {
    TerminalJob.jobs.delete(this.id);
    TerminalJob.onDidDisposeEmitter.fire(this);
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];

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

  /**
   * Set up event listeners for the terminal
   */
  private setupEventListeners(): void {
    // Listen for terminal close events
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        if (terminal === this.terminal) {
          this.outputManager.finalize(
            this.detached,
            ExecutionError.create("Terminal closed by user"),
          );
          this.dispose();
        }
      }),
    );

    // Listen for shell execution success.
    this.disposables.push(
      vscode.window.onDidEndTerminalShellExecution((event) => {
        if (event.execution === this.execution) {
          logger.debug("Terminal shell execution ended", event.exitCode);
          if (event.exitCode !== 0) {
            this.outputManager.finalize(
              this.detached,
              ExecutionError.create(
                `Command exited with code ${event.exitCode}`,
              ),
            );
          } else {
            this.outputManager.finalize(this.detached, undefined);
          }
          this.dispose();
        }
      }),
    );
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
}
