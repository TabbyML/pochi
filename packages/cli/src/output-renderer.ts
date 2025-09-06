import { formatters } from "@getpochi/common";
import { parseMarkdown } from "@getpochi/common/message-utils";
import type { Message, UITools } from "@getpochi/livekit";
import { type ToolUIPart, getToolName, isToolUIPart } from "ai";
import chalk from "chalk";
import ora, { type Ora } from "ora";
import type { NodeChatState } from "./livekit/chat.node";
import { ListrHelper } from "./listr-helper";

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
      // 清理已渲染的 newTask 记录，为新消息做准备
      this.renderedNewTasks.clear();
      const name = lastMessage.role === "assistant" ? "Pochi" : "You";
      if (messages.length > 1) {
        console.log("");
      }
      console.log(chalk.bold(chalk.underline(name)));
      // 不立即创建 spinner，等到有实际内容时再创建
      this.spinner = undefined;
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

      // 特殊处理 newTask - 在检查 spinner 之前
      if (part.type === "tool-newTask") {
        // 如果当前有 spinner 在运行，停止它
        if (this.spinner) {
          this.spinner.stop();
          this.spinner = undefined;
        }
        
        // 使用 toolCallId 来跟踪已渲染的任务，避免重复渲染
        if (!this.renderedNewTasks.has(part.toolCallId)) {
          this.renderedNewTasks.add(part.toolCallId);
          // 启动 listr 渲染（异步，不阻塞）
          this.listrHelper.renderNewTask(part);
        }
        
        // 对于 newTask，完全跳过常规的 OutputRenderer 处理
        // Listr 会处理所有的显示逻辑
        if (part.state === "output-available" || part.state === "output-error") {
          // newTask 完成，移动到下一个 part
          this.pendingPartIndex++;
          // 不创建新的 spinner，让下一次循环决定
          continue;
        } else {
          // 工具仍在执行中，等待状态更新
          break;
        }
      }

      // 对于非 newTask 的 part，确保有 spinner
      if (!this.spinner) {
        this.spinner = ora().start();
      }

      if (part.type === "reasoning") {
        this.spinner.prefixText = `💭 Thinking for ${part.text.length} characters`;
      } else if (part.type === "text") {
        this.spinner.prefixText = parseMarkdown(part.text.trim());
      } else {
        // 其他工具的常规处理
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
        this.spinner = undefined;  // 清理 spinner，下次循环会根据需要创建
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
