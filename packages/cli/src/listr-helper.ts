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

          // Wait for task completion
          await this.waitForSubtaskCompletion(part, taskId, (line: string) => {
            output += line;
            task.output = output;
          });

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

  /**
   * Wait for subtask completion (simplified version, mainly relies on tool state)
   */
  private async waitForSubtaskCompletion(
    part: ToolUIPart<UITools>,
    taskId?: string,
    onProgress?: (line: string) => void,
  ): Promise<void> {
    const processedToolCallIds = new Set<string>();
    return new Promise((resolve) => {
      let iterations = 0;
      const maxIterations = 300; // Maximum 60 seconds (300 * 200ms)

      const interval = setInterval(() => {
        iterations++;

        // Timeout protection
        if (iterations >= maxIterations) {
          clearInterval(interval);
          resolve();
          return;
        }

        // Check tool completion status
        if (part.state === "output-available") {
          clearInterval(interval);
          resolve();
          return;
        }

        // Check task completion flags: attemptCompletion or askFollowupQuestion
        if (taskId) {
          const subTaskRunner = ListrHelper.getSubTaskRunner(taskId);
          if (subTaskRunner) {
            // Directly check task completion flags in latest messages
            const messages =
              (((subTaskRunner as Record<string, unknown>).state as Record<
                string,
                unknown
              >)?.messages as unknown[]) || [];
            for (const message of messages) {
              const msg = message as Record<string, unknown>;
              if (msg.role === "assistant") {
                for (const msgPart of (msg.parts as unknown[]) || []) {
                  const p = msgPart as Record<string, unknown>;

                  // Lightweight tool running display (exclude completion/followup)
                  if (
                    typeof p.type === "string" &&
                    p.type.startsWith("tool-") &&
                    p.type !== "tool-attemptCompletion" &&
                    onProgress
                  ) {
                    const toolPart = p as ToolUIPart<UITools>;
                    if (!processedToolCallIds.has(toolPart.toolCallId)) {
                      processedToolCallIds.add(toolPart.toolCallId);
                      const normalizedPart = normalizeFollowUpInPart(toolPart);
                      const { text } = renderToolPart(normalizedPart);
                      onProgress(`${chalk.cyan(`  > ${text}`)}\n`);
                    }
                  }

                  // Completion checks
                  if (
                    p.type === "tool-attemptCompletion" ||
                    p.type === "tool-askFollowupQuestion"
                  ) {
                    // For askFollowupQuestion, allow a brief delay so it can render before we resolve
                    if (p.type === "tool-askFollowupQuestion") {
                      clearInterval(interval);
                      setTimeout(() => {
                        resolve();
                      }, 250);
                      return;
                    }

                    // For attemptCompletion, resolve immediately
                    clearInterval(interval);
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
