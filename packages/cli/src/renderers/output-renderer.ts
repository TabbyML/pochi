import { formatters } from "@getpochi/common";
import { parseMarkdown } from "@getpochi/common/message-utils";
import type { Message, UITools } from "@getpochi/livekit";
import { isAutoSuccessToolPart, isCompletionToolPart } from "@getpochi/tools";
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

  constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly state: NodeChatState,
    private readonly options: {
      attemptCompletionSchemaOverride?: boolean;
    } = {},
  ) {
    this.unsubscribe = this.state.signal.messages.subscribe((messages) => {
      this.renderLastMessage(messages);
    });
  }

  private pendingMessageId = "";
  private pendingPartIndex = -1;
  private spinner: Spinner | undefined = undefined;

  renderLastMessage(messages: Message[]) {
    if (this.renderingSubTask) {
      return;
    }

    const lastMessage = formatters.ui(messages).at(-1);
    if (!lastMessage) {
      return;
    }

    if (this.pendingMessageId !== lastMessage.id) {
      this.pendingMessageId = lastMessage.id;
      this.spinner?.stopAndPersist();
      this.pendingPartIndex = 0;

      const name = lastMessage.role === "assistant" ? "Pochi" : "You";
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
        part.type === "tool-newTask" ||
        !(
          part.type === "text" ||
          part.type === "reasoning" ||
          isStaticToolUIPart(part)
        )
      ) {
        this.pendingPartIndex++;
        continue;
      }

      if (!this.spinner) throw new Error("Spinner not initialized");

      if (part.type === "reasoning") {
        this.spinner.prefixText = `💭 Thinking for ${part.text.length} characters`;
      } else if (part.type === "text") {
        this.spinner.prefixText = parseMarkdown(part.text.trim());
      } else {
        // Regular processing for other tools
        const { text, stop, error } = renderToolPart(
          part,
          this.options.attemptCompletionSchemaOverride,
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
        break;
      }

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
    this.spinner = createSpinner({ stream: this.stream }).start();
    if (nextPendingPart) {
      this.pendingPartIndex++;
    }
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
    this.spinner?.stopAndPersist();
    this.spinner = undefined;
  }
}

function renderToolPart(
  part: ToolUIPart<UITools>,
  attemptCompletionSchemaOverride = false,
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
    return {
      text: `📖 Reading ${chalk.bold(path)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  if (part.type === "tool-writeToFile") {
    const { path = "unknown" } = part.input || {};
    return {
      text: `✏️  Writing ${chalk.bold(path)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  if (part.type === "tool-applyDiff") {
    const { path = "unknown" } = part.input || {};
    return {
      text: `🔧 Applying diff to ${chalk.bold(path)}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  // Search and listing tools
  if (part.type === "tool-listFiles") {
    const { path = ".", recursive = false } = part.input || {};
    const recursiveText = recursive ? " recursively" : "";
    return {
      text: `📂 Listing files in ${chalk.bold(path)}${recursiveText}`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }

  if (part.type === "tool-globFiles") {
    const { globPattern = "*", path = "." } = part.input || {};
    return {
      text: `🔍 Searching for ${chalk.bold(globPattern)} in ${chalk.bold(path)}`,
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
      text: `🔍 Searching for ${searchDesc} in ${chalk.bold(path)}`,
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

  if (part.type === "tool-todoWrite") {
    const { todos = [] } = part.input || {};
    return {
      text: `📋 Updating todo list (${todos.length} items)`,
      stop: hasError ? "fail" : "succeed",
      error: errorText,
    };
  }
  // Command execution
  if (part.type === "tool-executeCommand") {
    const { command = "" } = part.input || {};
    return {
      text: `💫 Executing ${chalk.bold(command)}`,
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
      content = input.result;
    }
    const text = `${chalk.bold(chalk.green("🎉 Task Completed"))}\n${content}`;

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
      if (isStaticToolUIPart(p) && !isCompletionToolPart(p)) {
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
