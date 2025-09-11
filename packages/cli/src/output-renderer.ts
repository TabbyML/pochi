import { formatters } from "@getpochi/common";
import { parseMarkdown } from "@getpochi/common/message-utils";
import type { Message, UITools } from "@getpochi/livekit";
import { isUserInputToolPart } from "@getpochi/tools";
import { type ToolUIPart, getToolName, isToolUIPart } from "ai";
import chalk from "chalk";
import { Listr, type ListrTask, type ObservableLike } from "listr2";
import ora, { type Ora } from "ora";
import type { NodeChatState } from "./livekit/chat.node";
import type { TaskRunner } from "./task-runner";

export class OutputRenderer {
  private renderingSubTask = false;
  constructor(private readonly state: NodeChatState) {
    this.state.signal.messages.subscribe((messages) => {
      this.renderLastMessage(messages);
    });
  }

  private pendingMessageId = "";
  private pendingPartIndex = -1;
  private spinner: Ora | undefined = undefined;

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
        console.log("");
      }
      console.log(chalk.bold(chalk.underline(name)));
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
          isToolUIPart(part)
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
        const { text, stop, error } = renderToolPart(part);
        this.spinner.prefixText = text;
        if (
          part.state === "output-available" ||
          part.state === "output-error"
        ) {
          if (error) {
            this.spinner.fail(chalk.dim(JSON.stringify(error)));
          } else {
            this.spinner[stop]();
          }
          this.nextSpinner(true);
        } else {
          break;
        }
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
    this.renderingSubTask = true;
    this.withoutSpinner(() => {
      const listr = makeListr(runner.taskId, this.state, runner.state);

      return listr.run();
    }).finally(() => {
      this.renderingSubTask = false;
    });
  }

  private nextSpinner(nextPendingPart = false) {
    this.spinner = ora().start();
    if (nextPendingPart) {
      this.pendingPartIndex++;
    }
  }

  private async withoutSpinner(callback: () => Promise<void>) {
    this.spinner?.stop();
    this.spinner = undefined;

    try {
      await callback();
    } finally {
      this.nextSpinner();
    }
  }

  shutdown() {
    this.spinner?.stopAndPersist();
    this.spinner = undefined;
  }
}

function renderToolPart(part: ToolUIPart<UITools>): {
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

  if (part.type === "tool-multiApplyDiff") {
    const { path = "unknown", edits = [] } = part.input || {};
    return {
      text: `🔧 Applying ${edits.length} edits to ${chalk.bold(path)}`,
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
    const { question, followUp } = part.input || {};
    const followUpText = Array.isArray(followUp)
      ? followUp
          .map((option, i) => `${chalk.dim(`   ${i + 1}.`)} ${option}`)
          .join("\n")
      : "";

    return {
      text: `${chalk.bold(chalk.yellow(`❓ ${question}`))}\n${followUpText}`,
      stop: "stopAndPersist",
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
    const { result = "" } = part.input || {};
    const text = `${chalk.bold(chalk.green("🎉 Task Completed"))}\n${chalk.dim("└─")} ${result}`;

    return {
      text,
      stop: "stopAndPersist",
      error: errorText,
    };
  }
  return {
    text: `Tool ${getToolName(part)}`,
    stop: hasError ? "fail" : "succeed",
    error: errorText,
  };
}

type NewTaskTool = Extract<ToolUIPart<UITools>, { type: "tool-newTask" }>;

function makeListr(
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

            const unsubscribe1 = subtask.signal.messages.subscribe(() => {
              onUpdate(() => unsubscribe1());
            });

            const unsubscribe2 = task.signal.messages.subscribe(() => {
              onUpdate(() => unsubscribe2());
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

function renderSubtaskMessages(messages: Message[]): string {
  let output = "";
  for (const x of messages) {
    for (const p of x.parts) {
      if (isToolUIPart(p) && !isUserInputToolPart(p)) {
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
