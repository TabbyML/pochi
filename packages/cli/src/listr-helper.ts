import type { UITools } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";
import chalk from "chalk";
import { Listr, type ListrTask } from "listr2";
import { renderToolPart } from "./output-renderer";

// Global registry for storing current subtask runners
const activeSubTaskRunners = new Map<string, unknown>();

export class ListrHelper {
  private listr: Listr | null = null;
  private isRunning = false;

  /**
   * Register subtask runner for Listr monitoring
   */
  static registerSubTaskRunner(taskId: string, runner: unknown): void {
    activeSubTaskRunners.set(taskId, runner);
  }

  /**
   * Unregister subtask runner
   */
  static unregisterSubTaskRunner(taskId: string): void {
    activeSubTaskRunners.delete(taskId);
  }

  /**
   * Get subtask runner
   */
  static getSubTaskRunner(taskId: string): unknown {
    const runner = activeSubTaskRunners.get(taskId);
    return runner;
  }

  /**
   * Create and run Listr task for newTask
   * Display subtask execution progress (asynchronous, non-blocking)
   */
  renderNewTask(part: ToolUIPart<UITools>): void {
    if (part.type !== "tool-newTask") return;

    const { description = "Creating subtask", prompt } = part.input || {};
    // Use toolCallId as identifier, which is more reliable
    const taskId = part.toolCallId;
    // Create main task
    const tasks: ListrTask[] = [
      {
        title: chalk.bold(`🚀 ${description}`),
        task: async (_ctx, task) => {
          let output = "";

          // Display prompt information
          if (prompt) {
            const shortPrompt =
              prompt.length > 150 ? `${prompt.substring(0, 147)}...` : prompt;
            output += `${chalk.dim(`Prompt: ${shortPrompt}`)}\n`;
          }

          // Initialization phase
          output += `${chalk.dim("> Setting up environment...")}\n`;
          task.output = output;
          await this.waitForTaskInit(part);

          // Execution phase
          output += `${chalk.dim("> Executing subtask...")}\n`;
          task.output = output;

          // Start tool monitoring, but don't block
          this.startToolMonitoring(taskId, (toolPart: ToolUIPart<UITools>) => {
            const normalizedPart = normalizeFollowUpInPart(toolPart);
            const { text } = renderToolPart(normalizedPart);
            output += `${chalk.cyan(`  > ${text}`)}\n`;
            task.output = output;
          });

          // Wait for task completion
          await this.waitForSubtaskCompletion(part, taskId);

          // Get final tool list
          const usedTools = this.getUsedTools(taskId);
          if (usedTools.length > 0) {
            output += `${chalk.dim(`> Tools used: ${usedTools.length} tool(s)`)}\n`;
          }

          // Result processing phase
          if (part.state !== "output-error") {
            task.output = output;
            await this.processTaskResult(part);

            // Display final results
            output += `${chalk.green("> ✓ Processing complete")}\n`;

            task.output = output;
          } else {
            // Error case
            output += `${chalk.red("> ✗ Subtask failed")}\n`;
            if (part.errorText) {
              output += `${chalk.dim(`  Error: ${part.errorText}`)}\n`;
            }
            task.output = output;
          }
        },
        // Key: Set persistentOutput at task level
        rendererOptions: { persistentOutput: true },
      },
    ];

    this.listr = new Listr(tasks, {
      concurrent: false,
      exitOnError: false,
      registerSignalListeners: false,
      rendererOptions: {
        showSubtasks: true,
        collapse: false,
        collapseErrors: false,
        collapseSkips: false,
        showTimer: true,
        clearOutput: false,
        formatOutput: "wrap",
        persistentOutput: true,
        removeEmptyLines: false,
        suffixSkips: false,
      },
    });

    this.isRunning = true;

    // Run asynchronously, don't block main flow
    this.listr
      .run()
      .then(() => {
        // Task completed
      })
      .finally(() => {
        this.isRunning = false;
        this.listr = null;
      });
  }

  /**
   * Wait for task initialization
   */
  private async waitForTaskInit(part: ToolUIPart<UITools>): Promise<void> {
    // Wait for state change to input-available or higher
    await this.waitForState(part, [
      "input-available",
      "output-available",
      "output-error",
    ]);
  }

  // Store tool monitoring state
  private toolMonitors = new Map<
    string,
    {
      tools: string[];
      interval?: NodeJS.Timeout;
      lastProcessedMessageIndex: number;
      processedToolCallIds: Set<string>;
    }
  >();

  /**
   * Start tool monitoring (non-blocking)
   */
  private startToolMonitoring(
    taskId: string,
    onToolUse: (toolPart: ToolUIPart<UITools>) => void,
  ): void {
    if (this.toolMonitors.has(taskId)) return;

    const monitor: {
      tools: string[];
      interval?: NodeJS.Timeout;
      lastProcessedMessageIndex: number;
      processedToolCallIds: Set<string>;
    } = {
      tools: [],
      lastProcessedMessageIndex: -1,
      processedToolCallIds: new Set<string>(),
    };

    this.toolMonitors.set(taskId, monitor);

    monitor.interval = setInterval(() => {
      const subTaskRunner = ListrHelper.getSubTaskRunner(taskId);
      if (subTaskRunner) {
        const messages =
          ((
            (subTaskRunner as Record<string, unknown>).state as Record<
              string,
              unknown
            >
          )?.messages as unknown[]) || [];

        // Re-check all messages to ensure none are missed
        for (let i = 0; i < messages.length; i++) {
          const message = messages[i] as Record<string, unknown>;
          if (message.role === "assistant") {
            for (const msgPart of (message.parts as unknown[]) || []) {
              const part = msgPart as Record<string, unknown>;
              if (part.type?.toString().startsWith("tool-")) {
                // Task completion flags are not displayed as regular tools
                if (part.type === "tool-attemptCompletion") {
                  continue;
                }
                const toolName = part.type.toString().replace("tool-", "");

                const toolPart = part as ToolUIPart<UITools>;
                // Render once per toolCallId to avoid missing updates
                if (!monitor.processedToolCallIds.has(toolPart.toolCallId)) {
                  monitor.processedToolCallIds.add(toolPart.toolCallId);
                  if (!monitor.tools.includes(toolName)) {
                    monitor.tools.push(toolName);
                  }
                  try {
                    onToolUse(toolPart);
                  } catch (error) {
                    // Handle error silently
                  }
                }
              }
            }
          }
        }
        monitor.lastProcessedMessageIndex = messages.length - 1;
      }
    }, 100);
  }

  /**
   * Get used tools
   */
  private getUsedTools(taskId: string): string[] {
    const monitor = this.toolMonitors.get(taskId);
    return monitor?.tools || [];
  }

  /**
   * Clean up tool monitoring
   */
  private cleanupToolMonitoring(taskId: string): void {
    const monitor = this.toolMonitors.get(taskId);
    if (monitor?.interval) {
      clearInterval(monitor.interval);
    }
    this.toolMonitors.delete(taskId);
  }

  /**
   * Wait for subtask completion (simplified version, mainly relies on tool state)
   */
  private async waitForSubtaskCompletion(
    part: ToolUIPart<UITools>,
    taskId?: string,
  ): Promise<void> {
    return new Promise((resolve) => {
      let iterations = 0;
      const maxIterations = 300; // Maximum 60 seconds (300 * 200ms)

      const interval = setInterval(() => {
        iterations++;

        // Timeout protection
        if (iterations >= maxIterations) {
          clearInterval(interval);
          if (taskId) this.cleanupToolMonitoring(taskId);
          resolve();
          return;
        }

        // Check tool completion status
        if (part.state === "output-available") {
          clearInterval(interval);
          if (taskId) this.cleanupToolMonitoring(taskId);
          resolve();
          return;
        }

        // Check task completion flags: attemptCompletion or askFollowupQuestion
        if (taskId) {
          const subTaskRunner = ListrHelper.getSubTaskRunner(taskId);
          if (subTaskRunner) {
            // Directly check task completion flags in latest messages
            const messages =
              ((
                (subTaskRunner as Record<string, unknown>).state as Record<
                  string,
                  unknown
                >
              )?.messages as unknown[]) || [];
            for (const message of messages) {
              const msg = message as Record<string, unknown>;
              if (msg.role === "assistant") {
                for (const msgPart of (msg.parts as unknown[]) || []) {
                  const part = msgPart as Record<string, unknown>;
                  if (
                    part.type === "tool-attemptCompletion" ||
                    part.type === "tool-askFollowupQuestion"
                  ) {
                    // For askFollowupQuestion, allow a brief delay so it can render before we resolve
                    if (part.type === "tool-askFollowupQuestion") {
                      clearInterval(interval);
                      if (taskId) {
                        setTimeout(
                          () => this.cleanupToolMonitoring(taskId),
                          250,
                        );
                      }
                      setTimeout(() => {
                        resolve();
                      }, 250);
                      return;
                    }

                    // For attemptCompletion, resolve immediately
                    clearInterval(interval);
                    this.cleanupToolMonitoring(taskId);
                    resolve();
                    return;
                  }
                }
              }
            }
          }
        }

        // Check error status
        if (part.state === "output-error") {
          clearInterval(interval);
          if (taskId) this.cleanupToolMonitoring(taskId);
          resolve();
          return;
        }
      }, 200);
    });
  }

  /**
   * Process task result
   */
  private async processTaskResult(_part: ToolUIPart<UITools>): Promise<void> {
    // Wait a short time to ensure results are complete
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  /**
   * Wait for specific state
   */
  private async waitForState(
    part: ToolUIPart<UITools>,
    targetStates: string[],
  ): Promise<void> {
    return new Promise((resolve) => {
      const checkState = setInterval(() => {
        if (targetStates.includes(part.state)) {
          clearInterval(checkState);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Stop currently running Listr
   */
  stop(): void {
    if (this.isRunning && this.listr) {
      this.isRunning = false;
      this.listr = null;
    }
  }

  /**
   * Check if currently running
   */
  get running(): boolean {
    return this.isRunning;
  }
}

// Add normalize helper for followUp so renderer remains unchanged
function normalizeFollowUpInPart(
  part: ToolUIPart<UITools>,
): ToolUIPart<UITools> {
  try {
    const input: Record<string, unknown> | undefined = part.input as
      | Record<string, unknown>
      | undefined;
    if (!input) return part;

    const followUp = (input as Record<string, unknown>).followUp as
      | unknown
      | undefined;
    if (typeof followUp === "string") {
      const s = followUp.trim();
      let options: string[] | null = null;
      // Try JSON
      try {
        const parsed = JSON.parse(s) as unknown;
        if (Array.isArray(parsed)) {
          options = parsed as string[];
        }
      } catch {}
      // Try single-quoted array
      if (!options && s.startsWith("[") && s.endsWith("]")) {
        try {
          const parsed2 = JSON.parse(s.replace(/'/g, '"')) as unknown;
          if (Array.isArray(parsed2)) {
            options = parsed2 as string[];
          }
        } catch {}
      }
      // Try CSV
      if (!options) {
        const parts = s
          .split(",")
          .map((x: string) => x.trim())
          .filter((x: string) => Boolean(x));
        if (parts.length > 1) options = parts;
      }
      if (options) {
        return {
          ...part,
          input: { ...input, followUp: options },
        } as ToolUIPart<UITools>;
      }
    }
  } catch {}
  return part;
}
