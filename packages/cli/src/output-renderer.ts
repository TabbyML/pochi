import { formatters } from "@getpochi/common";
import { parseMarkdown } from "@getpochi/common/message-utils";
import type { Message, UITools } from "@getpochi/livekit";
import { type ToolUIPart, getToolName, isToolUIPart } from "ai";
import chalk from "chalk";
import ora, { type Ora } from "ora";
import { ListrHelper } from "./listr-helper";
import type { NodeChatState } from "./livekit/chat.node";

export class OutputRenderer {
  private listrHelper = new ListrHelper();
  private renderedNewTasks = new Set<string>();

  constructor(state: NodeChatState) {
    state.signal.messages.subscribe((messages) => {
      this.renderLastMessage(messages);
    });
  }

  private pendingMessageId = "";
  private pendingPartIndex = -1;
  private spinner: Ora | undefined = undefined;

  renderLastMessage(messages: Message[]) {
    const lastMessage = formatters.ui(messages).at(-1);
    if (!lastMessage) {
      return;
    }

    if (this.pendingMessageId !== lastMessage.id) {
      this.pendingMessageId = lastMessage.id;
      this.spinner?.stopAndPersist();
      this.pendingPartIndex = 0;

      // Clear rendered newTask records to prepare for new messages
      this.renderedNewTasks.clear();

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
        !(
          part.type === "text" ||
          part.type === "reasoning" ||
          isToolUIPart(part)
        )
      ) {
        this.pendingPartIndex++;
        continue;
      }

      // Special handling for newTask - before checking spinner
      if (part.type === "tool-newTask") {
        // If there's currently a spinner running, stop it
        if (this.spinner) {
          this.spinner.stop();
          this.spinner = undefined;
        }

        // Use toolCallId to track rendered tasks, avoiding duplicate rendering
        if (!this.renderedNewTasks.has(part.toolCallId)) {
          this.renderedNewTasks.add(part.toolCallId);
          // Start listr rendering (async, non-blocking)
          this.listrHelper.renderNewTask(part);
        }

        // For newTask, completely skip regular OutputRenderer processing
        // Listr will handle all display logic
        if (
          part.state === "output-available" ||
          part.state === "output-error"
        ) {
          // newTask completed, move to next part
          this.pendingPartIndex++;
          // Don't create new spinner, let next loop decide
          continue;
        }
        // Tool is still executing, wait for state update
        break;
      }

      // For non-newTask parts, ensure there's a spinner
      if (!this.spinner) {
        this.spinner = ora().start();
      }

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

  private nextSpinner(nextPendingPart = false) {
    this.spinner = ora().start();
    if (nextPendingPart) {
      this.pendingPartIndex++;
    }
  }

  shutdown() {
    this.spinner?.stopAndPersist();
    this.spinner = undefined;
    this.listrHelper.stop();
  }
}

export function renderToolPart(part: ToolUIPart<UITools>): {
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
      text: `${chalk.bold(chalk.yellow(`❓ ${question}`))} ${followUpText}`,
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
