import { formatters } from "@getpochi/common";
import { parseMarkdown } from "@getpochi/common/message-utils";
import type { Message, UITools } from "@getpochi/livekit";
import { type ToolUIPart, getToolName, isToolUIPart } from "ai";
import chalk from "chalk";
import ora, { type Ora } from "ora";
import type { NodeChatState } from "./livekit/chat.node";

export class OutputRenderer {
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

      if (!this.spinner) throw new Error("Spinner not initialized");

      if (part.type === "reasoning") {
        this.spinner.prefixText = `💭 Thinking for ${part.text.length} characters`;
      } else if (part.type === "text") {
        this.spinner.prefixText = parseMarkdown(part.text.trim());
      } else {
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
      text: `${chalk.bold(chalk.yellow(`❓ ${question}`))} ${followUpText}`,
      stop: "stopAndPersist",
      error: errorText,
    };
  }

  if (part.type === "tool-newTask") {
    const { description = "creating subtask" } = part.input || {};
    
    if (part.state === "output-available" && part.output && typeof part.output === "object" && "result" in part.output) {
      const result = part.output.result as string;
      return {
        text: `🚀 Subtask completed: ${chalk.bold(description)}\n${chalk.dim("└─")} ${result}`,
        stop: hasError ? "fail" : "succeed",
        error: errorText,
      };
    } else if (part.state === "input-streaming" || part.state === "input-available") {
      return {
        text: `🚀 Executing subtask: ${chalk.bold(description)}`,
        stop: "stopAndPersist",
        error: errorText,
      };
    } else {
      return {
        text: `🚀 Creating subtask: ${chalk.bold(description)}`,
        stop: hasError ? "fail" : "succeed",
        error: errorText,
      };
    }
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
