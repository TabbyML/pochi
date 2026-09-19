import { homedir } from "node:os";
import {
  type BackgroundJobNotification,
  formatters,
  shouldRunSubAgentInBackground,
} from "@getpochi/common";
import { parseMarkdown } from "@getpochi/common/message-utils";
import {
  formatPochiFileDisplayPath,
  parseBackgroundJobOutputFilePath,
} from "@getpochi/common/pochi-file-system";
import type { Message, UITools } from "@getpochi/livekit";
import { isAutoSuccessToolPart, isUserInputToolPart } from "@getpochi/tools";
import { type ToolUIPart, getStaticToolName, isStaticToolUIPart } from "ai";
import chalk from "chalk";
import {
  Listr,
  type ListrTask,
  ListrTaskEventType,
  type ListrTaskObject,
  type ObservableLike,
} from "listr2";
import { type Spinner, createSpinner } from "../lib/spinner";
import type { NodeChatState } from "../livekit/chat.node";
import type { TaskRunner } from "../task-runner";

export class OutputRenderer {
  private renderingSubTask = false;
  private subTaskQueue: Promise<void> = Promise.resolve();
  private pendingSubTasks = 0;
  private unsubscribe: (() => void) | undefined;
  private readonly renderedNotifications = new Set<string>();

  constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly state: NodeChatState,
    private readonly options: {
      attemptCompletionSchemaOverride?: boolean;
      hasPendingBackgroundJobs?: () => boolean;
    } = {},
  ) {
    this.unsubscribe = this.state.signal.messages.subscribe((messages) => {
      this.renderLastMessage(messages);
    });
  }

  private pendingMessageId = "";
  private pendingPartIndex = -1;
  private spinner: Spinner | undefined = undefined;
  private compactSpinner: Spinner | undefined = undefined;

  renderCompactStart() {
    this.persistSpinner();
    this.compactSpinner = createSpinner({
      stream: this.stream,
      text: "🧹 Compacting context",
    }).start();
  }

  renderCompactFinish(success: boolean) {
    const spinner = this.compactSpinner;
    this.compactSpinner = undefined;
    if (!spinner) return;

    if (success) {
      spinner.succeed("Context compacted");
    } else {
      spinner.fail("Context compaction failed");
    }
  }

  renderLastMessage(messages: Message[]) {
    if (this.renderingSubTask) {
      return;
    }

    const lastMessage = formatters.ui(messages).at(-1);
    if (!lastMessage) {
      return;
    }
    const notificationOnly =
      lastMessage.parts.length > 0 &&
      lastMessage.parts.every(
        (part) => part.type === "data-background-job-notification",
      );
    if (
      notificationOnly &&
      lastMessage.parts.every(
        (part) =>
          part.type === "data-background-job-notification" &&
          this.renderedNotifications.has(part.data.notificationId),
      )
    )
      return;

    if (this.pendingMessageId !== lastMessage.id) {
      this.pendingMessageId = lastMessage.id;
      this.persistSpinner();
      this.pendingPartIndex = 0;

      const name =
        lastMessage.role === "assistant"
          ? "Pochi"
          : notificationOnly
            ? "Background jobs"
            : "You";
      if (messages.length > 1) {
        this.stream.write("\n");
      }
      this.stream.write(`${chalk.bold(chalk.underline(name))}\n`);
      this.nextSpinner();
    }

    while (true) {
      const part = lastMessage.parts.at(this.pendingPartIndex);
      if (!part) {
        break;
      }

      if (
        (part.type === "tool-newTask" &&
          !shouldRunSubAgentInBackground(part.input)) ||
        !(
          part.type === "text" ||
          part.type === "reasoning" ||
          part.type === "data-background-job-notification" ||
          isStaticToolUIPart(part)
        )
      ) {
        this.pendingPartIndex++;
        continue;
      }

      if (!this.spinner) throw new Error("Spinner not initialized");

      if (part.type === "data-background-job-notification") {
        const notification = part.data;
        if (this.renderedNotifications.has(notification.notificationId)) {
          this.pendingPartIndex++;
          continue;
        }
        this.renderedNotifications.add(notification.notificationId);
        this.spinner.prefixText = renderBackgroundNotification(notification);
        const stop =
          notification.status === "completed"
            ? "succeed"
            : notification.status === "failed"
              ? "fail"
              : "stopAndPersist";
        this.spinner[stop]();
        this.nextSpinner(true);
        continue;
      }

      if (part.type === "reasoning") {
        this.spinner.prefixText = `💭 Thinking for ${part.text.length} characters`;
      } else if (part.type === "text") {
        this.spinner.prefixText = parseMarkdown(part.text.trim());
      } else {
        // Regular processing for other tools
        const { text, stop, error } = renderToolPart(
          part,
          this.options.attemptCompletionSchemaOverride,
          this.options.hasPendingBackgroundJobs?.() ?? false,
        );
        this.spinner.prefixText = text;

        if (
          (isStaticToolUIPart(part) &&
            isAutoSuccessToolPart(part) &&
            part.state === "input-available") ||
          part.state === "output-available" ||
          part.state === "output-error"
        ) {
          if (error) {
            this.spinner.fail(chalk.dim(JSON.stringify(error)));
          } else {
            this.spinner[stop]();
          }
          this.nextSpinner(true);
          continue;
        }
        this.spinner.start();
        break;
      }

      if (lastMessage.role === "user") {
        this.spinner.stopAndPersist();
        this.nextSpinner(true);
        continue;
      }
      this.spinner.start();

      if (this.pendingPartIndex < lastMessage.parts.length - 1) {
        this.spinner?.stopAndPersist();
        this.nextSpinner();
        this.pendingPartIndex++;
      } else {
        break;
      }
    }
  }

  renderSubTask(runner: TaskRunner) {
    this.pendingSubTasks++;
    this.renderingSubTask = true;
    this.subTaskQueue = this.subTaskQueue
      .then(async () => {
        await this.withoutSpinner(async () => {
          const listr = makeListr(
            this.stream,
            runner.taskId,
            this.state,
            runner.state,
          );

          await listr.run();
        });
      })
      .finally(() => {
        this.pendingSubTasks--;
        if (this.pendingSubTasks === 0) {
          this.renderingSubTask = false;
        }
      });
  }

  private nextSpinner(nextPendingPart = false) {
    // Start only when there is an active part to render. An idle spinner would
    // fight the runner's background-wait spinner and keep animating after done.
    this.spinner = createSpinner({ stream: this.stream });
    if (nextPendingPart) {
      this.pendingPartIndex++;
    }
  }

  private persistSpinner() {
    if (this.spinner?.prefixText || this.spinner?.text)
      this.spinner.stopAndPersist();
    else this.spinner?.stop();
  }

  private async withoutSpinner(callback: () => Promise<void>) {
    const oldSpinner = this.spinner;
    if (oldSpinner) {
      oldSpinner.stop();
      this.spinner = undefined;
    }

    try {
      await callback();
    } finally {
      if (oldSpinner) {
        this.nextSpinner();
      }
    }
  }

  shutdown() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    this.persistSpinner();
    this.spinner = undefined;
    this.compactSpinner?.stopAndPersist();
    this.compactSpinner = undefined;
  }
}

export function renderToolPart(
  part: ToolUIPart<UITools>,
  attemptCompletionSchemaOverride = false,
  hasPendingBackgroundJobs = false,
): {
  text: string;
  stop: "succeed" | "stopAndPersist" | "fail";
  error?: string;
} {
  const errorText =
    part.state === "output-error"
      ? part.errorText
      : part.state === "output-available" &&
          typeof part.output === "object" &&
          part.output &&
          "error" in part.output &&
          typeof part.output.error === "string"
        ? part.output.error
        : undefined;

  const hasError = !!errorText;

  // File operation tools
  if (part.type === "tool-readFile") {
    const { path = "unknown" } = part.input || {};
    const backgroundJobOutput = parseBackgroundJobOutputFilePath(path);
    return {
      text: backgroundJobOutput
        ? `📖 Reading ${backgroundJobOutput.kind === "terminal" ? "terminal" : "background job"} output ${chalk.bold(backgroundJobOutput.backgroundJobId)}`
        : `📖 Reading ${formatCliDisplayPath(path)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  if (part.type === "tool-writeToFile") {
    const { path = "unknown" } = part.input || {};
    return {
      text: `✏️  Writing ${formatCliDisplayPath(path)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  if (part.type === "tool-applyDiff") {
    const { path = "unknown" } = part.input || {};
    return {
      text: `🔧 Applying diff to ${formatCliDisplayPath(path)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  // Search and listing tools
  if (part.type === "tool-listFiles") {
    const { path = ".", recursive = false } = part.input || {};
    const recursiveText = recursive ? " recursively" : "";
    return {
      text: `📂 Listing files in ${formatCliDisplayPath(path)}${recursiveText}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  if (part.type === "tool-globFiles") {
    const { globPattern = "*", path = "." } = part.input || {};
    return {
      text: `🔍 Searching for ${chalk.bold(globPattern)} in ${formatCliDisplayPath(path)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  if (part.type === "tool-searchFiles") {
    const { regex = "", path = ".", filePattern = "" } = part.input || {};
    const searchDesc = filePattern
      ? `${chalk.bold(regex)} in ${chalk.bold(filePattern)} files`
      : `${chalk.bold(regex)}`;
    return {
      text: `🔍 Searching for ${searchDesc} in ${formatCliDisplayPath(path)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  if ((part.type as string) === "tool-webFetch") {
    const { url = "unknown" } = (part.input as { url?: string }) || {};
    return {
      text: `🌐 Fetching ${chalk.bold(url)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  if ((part.type as string) === "tool-webSearch") {
    const { query = "" } = (part.input as { query?: string | string[] }) || {};
    const queryText = Array.isArray(query) ? query.join(", ") : query;
    return {
      text: `🔎 Searching the web for ${chalk.bold(queryText)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  // Interactive tools
  if (part.type === "tool-askFollowupQuestion") {
    const { questions } = part.input || {};
    const questionsText = Array.isArray(questions)
      ? questions
          .map((q) => {
            if (!q) return "";
            const header = q.header ? `[${q.header}] ` : "";
            const optionsText = Array.isArray(q.options)
              ? q.options
                  .map((opt, i: number) =>
                    opt
                      ? `${chalk.dim(`   ${i + 1}.`)} ${opt.label ?? ""}`
                      : "",
                  )
                  .filter(Boolean)
                  .join("\n")
              : "";
            return `${chalk.bold(chalk.yellow(`❓ ${header}${q.question ?? ""}`))}${optionsText ? `\n${optionsText}` : ""}`;
          })
          .filter(Boolean)
          .join("\n\n")
      : "";

    return {
      text: questionsText,
      stop: "stopAndPersist",
      error: errorText,
    };
  }

  if (part.type === "tool-useSkill") {
    const { skill = "unknown" } = part.input || {};
    return {
      text: `🧩 Using skill ${chalk.bold(skill)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  // Command execution
  if (part.type === "tool-executeCommand") {
    const { command = "", background = false } = part.input || {};
    const metadata =
      part.state === "output-available" ? part.output._meta : undefined;
    if (metadata?.backgroundJobId && !hasError) {
      return {
        text: `💫 Started background command ${chalk.bold(metadata.backgroundJobId)}\n${command}${metadata.outputFile ? `\nOutput: ${formatCliDisplayPath(metadata.outputFile)}` : ""}`,
        stop: "stopAndPersist",
      };
    }
    return {
      text: `${background ? "💫 Running in background" : "💫 Executing"} ${chalk.bold(command)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  if (part.type === "tool-newTask") {
    const description = part.input?.description ?? "Subagent";
    const jobId =
      part.state === "output-available"
        ? part.output.backgroundJobId
        : undefined;
    return {
      text: jobId
        ? `🤖 Started background agent ${chalk.bold(description)} (${jobId})`
        : `🤖 Starting background agent ${chalk.bold(description)}`,
      stop: hasError ? "fail" : "stopAndPersist",
      error: errorText,
    };
  }

  if (part.type === "tool-killBackgroundJob") {
    const stopped = part.state === "output-available" && !hasError;
    return {
      text: `🛑 ${stopped ? "Stopped" : "Stopping"} background job ${chalk.bold(part.input?.backgroundJobId ?? "")}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  if (part.type === "tool-attemptCompletion") {
    const input = part.input || {};

    let content = "";
    if (part.state === "input-streaming") {
      return {
        text: "",
        stop: "stopAndPersist",
        error: errorText,
      };
    }
    if (attemptCompletionSchemaOverride) {
      content = JSON.stringify(input.result, null, 2);
    } else {
      content = input.result as string;
    }
    const title = hasPendingBackgroundJobs
      ? chalk.yellow("⏳ Background work pending")
      : chalk.green("🎉 Task Completed");
    const text = `${chalk.bold(title)}\n${content}`;

    return {
      text,
      stop: "stopAndPersist",
      error: errorText,
    };
  }

  return {
    text: `🛠️ Tool ${getStaticToolName(part)}`,
    stop: hasError ? "fail" : "succeed",
    error: errorText,
  };
}

function renderBackgroundNotification(notification: BackgroundJobNotification) {
  if (notification.kind === "command") {
    return `${notification.summary} (${notification.backgroundJobId})`;
  }
  const title = notification.title ?? notification.agentType ?? "Subagent";
  return `🤖 Background agent ${notification.status}: ${title} (${notification.backgroundJobId})\n${notification.result}`;
}

function formatCliDisplayPath(path: string) {
  return chalk.bold(formatPochiFileDisplayPath(path, { homeDir: homedir() }));
}

type NewTaskTool = Extract<ToolUIPart<UITools>, { type: "tool-newTask" }>;

function makeListr(
  stream: NodeJS.WritableStream,
  subTaskId: string,
  task: NodeChatState,
  subtask: NodeChatState,
): Listr {
  const part = extractNewTaskTool(task.messages, subTaskId);

  const tasks: ListrTask[] = [
    {
      title: part?.input?.agentType
        ? `${part.input.description} (${chalk.cyan(part.input.agentType)})`
        : part?.input?.description,
      task: async () => {
        const observable: ObservableLike<string> = {
          subscribe(observer) {
            const onUpdate = (unsubscribe: () => void) => {
              const finalize = (err?: Error) => {
                unsubscribe();
                if (err) {
                  observer.error(err);
                } else {
                  observer.complete();
                }
              };
              const part = extractNewTaskTool(task.messages, subTaskId);
              if (!part) {
                finalize(new Error("No new task tool found"));
              } else if (part.state === "output-error") {
                finalize(new Error(part.errorText));
              } else if (part.state === "output-available") {
                finalize();
              } else {
                observer.next(
                  renderSubtaskMessages(formatters.ui(subtask.messages)),
                );
              }
            };

            // subscribe() invokes its callback synchronously before returning the
            // unsubscribe fn, so the unsubscribe reference must resolve lazily.
            // `const u = subscribe(...)` throws TDZ when the callback reads `u`.
            // `let u; u = subscribe(...)` avoids TDZ but biome's useConst flags it
            // because `u` is assigned exactly once. An object with a mutable
            // property satisfies both: const binding + late-bound reference.
            const ref1: { unsubscribe?: () => void } = {};
            ref1.unsubscribe = subtask.signal.messages.subscribe(() => {
              onUpdate(() => ref1.unsubscribe?.());
            });

            const ref2: { unsubscribe?: () => void } = {};
            ref2.unsubscribe = task.signal.messages.subscribe(() => {
              onUpdate(() => ref2.unsubscribe?.());
            });

            return;
          },
        };

        return observable;
      },
      // Key: Set persistentOutput at task level
      rendererOptions: { persistentOutput: true },
    },
  ];

  return new Listr(tasks, {
    concurrent: false,
    exitOnError: false,
    registerSignalListeners: false,
    rendererOptions: {
      output: stream,
      lazy: true,
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
    fallbackRenderer: SubTaskNonTTYRenderer,
    fallbackRendererOptions: {
      stream: stream,
    },
  });
}

function extractNewTaskTool(
  messages: Message[],
  uid: string,
): NewTaskTool | undefined {
  const lastMessage = formatters.ui(messages).at(-1);
  if (!lastMessage) {
    return;
  }

  for (const part of lastMessage.parts) {
    if (part.type === "tool-newTask" && part.input?._meta?.uid === uid) {
      return part;
    }
  }
}

class SubTaskNonTTYRenderer {
  private task: ListrTaskObject<never>;
  private stream: NodeJS.WritableStream;
  constructor(
    tasks: ListrTaskObject<never>[],
    options: { stream: NodeJS.WritableStream },
  ) {
    // only accept 1 task
    this.task = tasks[0];
    this.stream = options.stream;
  }

  public render(): void {
    this.stream.write(`❯ ${this.task.title}`);

    let lastOutput: string | undefined = undefined;
    this.task.on(ListrTaskEventType.OUTPUT, (output) => {
      if (output.trimEnd().length === 0) {
        return;
      }

      let outputCurrentLine = "";
      let outputNewLines: string[] = [];

      const outputLines = output.trimEnd().split("\n");
      if (!lastOutput) {
        outputNewLines = outputLines;
      } else {
        const lastOutputLines = lastOutput.trimEnd().split("\n");
        let sameLines = 0;
        while (
          sameLines < outputLines.length &&
          sameLines < lastOutputLines.length &&
          outputLines[sameLines] === lastOutputLines[sameLines]
        ) {
          sameLines++;
        }

        if (
          sameLines < outputLines.length &&
          sameLines === lastOutputLines.length - 1 &&
          outputLines[sameLines].startsWith(lastOutputLines[sameLines])
        ) {
          outputCurrentLine = outputLines[sameLines].slice(
            lastOutputLines[sameLines].length,
          );
          outputNewLines = outputLines.slice(sameLines + 1);
        } else {
          outputNewLines = outputLines.slice(sameLines);
        }
      }

      this.stream.write(outputCurrentLine);
      for (const line of outputNewLines) {
        this.stream.write(`\n| ${line}`);
      }
      lastOutput = output;
    });
  }

  public end(err: Error): void {
    if (err) {
      this.stream.write(`\n✗ ${this.task.title}: ${err.message}\n`);
    } else {
      this.stream.write(`\n✔ ${this.task.title}\n`);
    }
  }
}

function renderSubtaskMessages(messages: Message[]): string {
  let output = "";
  for (const x of messages) {
    for (const p of x.parts) {
      if (isStaticToolUIPart(p) && !isUserInputToolPart(p)) {
        const { text } = renderToolPart(p);
        const lines = text.split("\n");
        for (const line of lines) {
          output += `${chalk.dim(`${line}`)}\n`;
        }
      }
    }
  }

  return output;
}
