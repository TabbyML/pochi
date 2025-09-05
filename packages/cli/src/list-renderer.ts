import { formatters } from "@getpochi/common";
import type { Message, UITools } from "@getpochi/livekit";
import { type ToolUIPart, isToolUIPart } from "ai";
import chalk from "chalk";
import type { NodeChatState } from "./livekit/chat.node";

interface TaskState {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

export class ListRenderer {
  private taskStates = new Map<string, TaskState>();
  private pendingMessageId = "";
  private pendingPartIndex = -1;
  private hasShownHeader = false;
  private renderedTasks = new Set<string>();

  constructor(state: NodeChatState) {
    // 监听消息变化，只处理tool-newTask
    state.signal.messages.subscribe((messages) => {
      this.processNewTaskMessages(messages);
    });
  }

  private processNewTaskMessages(messages: Message[]) {
    const lastMessage = formatters.ui(messages).at(-1);
    if (!lastMessage) {
      return;
    }

    // 只处理新消息
    if (this.pendingMessageId !== lastMessage.id) {
      this.pendingMessageId = lastMessage.id;
      this.pendingPartIndex = 0;
    }

    // 扫描所有parts，查找tool-newTask
    for (let i = this.pendingPartIndex; i < lastMessage.parts.length; i++) {
      const part = lastMessage.parts[i];
      
      if (isToolUIPart(part) && part.type === "tool-newTask") {
        this.handleNewTaskPart(part, i);
      }
    }

    this.pendingPartIndex = lastMessage.parts.length;
  }

  private handleNewTaskPart(part: ToolUIPart<UITools>, partIndex: number) {
    const taskId = `${this.pendingMessageId}-${partIndex}`;
    const description = (part.input as any)?.description || "Subtask";

    if (part.state === "input-streaming" || part.state === "input-available") {
      // 任务开始执行
      this.createOrUpdateTask(taskId, {
        id: taskId,
        title: `🚀 ${description}`,
        status: 'running'
      });
    } else if (part.state === "output-available" && (part.output as any)?.result) {
      // 任务完成
      const result = (part.output as any).result as string;
      this.createOrUpdateTask(taskId, {
        id: taskId,
        title: `✅ ${description}`,
        status: 'completed',
        result
      });
    } else if (part.state === "output-error") {
      // 任务失败
      this.createOrUpdateTask(taskId, {
        id: taskId,
        title: `❌ ${description}`,
        status: 'failed',
        error: part.errorText
      });
    } else {
      // 任务创建
      this.createOrUpdateTask(taskId, {
        id: taskId,
        title: `⏳ ${description}`,
        status: 'pending'
      });
    }
  }

  private createOrUpdateTask(taskId: string, taskState: TaskState) {
    const previousState = this.taskStates.get(taskId);
    this.taskStates.set(taskId, taskState);

    // 只在状态真正改变时渲染
    if (!previousState || 
        previousState.status !== taskState.status || 
        previousState.title !== taskState.title) {
      this.renderTaskToStderr(taskState, taskId);
    }
  }

  private renderTaskToStderr(taskState: TaskState, taskId: string) {
    if (!this.hasShownHeader) {
      // 使用stderr输出，避免与主stdout冲突
      process.stderr.write(chalk.bold(chalk.blue("\n📋 Subtasks:\n")));
      this.hasShownHeader = true;
    }

    let statusIcon = "⏳";
    let statusColor = chalk.gray;
    let suffix = "";

    switch (taskState.status) {
      case 'running':
        statusIcon = "🔄";
        statusColor = chalk.blue;
        suffix = chalk.dim(" (running...)");
        break;
      case 'completed':
        statusIcon = "✅";
        statusColor = chalk.green;
        if (taskState.result) {
          suffix = chalk.dim(`\n   └─ ${taskState.result}`);
        }
        break;
      case 'failed':
        statusIcon = "❌";
        statusColor = chalk.red;
        if (taskState.error) {
          suffix = chalk.red(`\n   └─ Error: ${taskState.error}`);
        }
        break;
      default:
        statusIcon = "⏳";
        statusColor = chalk.gray;
    }

    const title = taskState.title.replace(/^[🚀⏳🔄✅❌]\s*/, '');
    
    // 如果任务已经渲染过且状态没有实质性改变，则更新现有行
    if (this.renderedTasks.has(taskId) && taskState.status === 'running') {
      // 对于运行中的任务，使用\r来更新同一行
      process.stderr.write(`\r   ${statusIcon} ${statusColor(title)}${suffix}`);
    } else {
      // 新任务或状态改变，输出新行
      process.stderr.write(`   ${statusIcon} ${statusColor(title)}${suffix}\n`);
      this.renderedTasks.add(taskId);
    }
  }

  private formatTaskTitle(taskState: TaskState): string {
    // 移除emoji前缀，让listr2处理状态显示
    const title = taskState.title.replace(/^[🚀⏳🔄✅❌]\s*/, '');
    
    // 限制标题长度以防止过长
    const maxLength = 60;
    if (title.length <= maxLength) {
      return title;
    }
    return `${title.substring(0, maxLength - 3)}...`;
  }

  private formatResultOutput(result: string): string {
    // 格式化结果输出，限制长度并添加省略号
    const maxLength = 100;
    if (result.length <= maxLength) {
      return chalk.green(result);
    }
    return chalk.green(`${result.substring(0, maxLength - 3)}...`);
  }

  private formatErrorOutput(error: string): string {
    // 格式化错误输出，清理并限制长度
    let cleanError = error.replace(/\s+/g, ' ').trim();
    const maxLength = 150;
    if (cleanError.length <= maxLength) {
      return chalk.red(`Error: ${cleanError}`);
    }
    return chalk.red(`Error: ${cleanError.substring(0, maxLength - 10)}...`);
  }



  shutdown() {
    // 清理资源
    this.taskStates.clear();
    this.renderedTasks.clear();
    if (this.hasShownHeader) {
      process.stderr.write("\n"); // 添加结束空行
    }
  }

  // 获取当前任务数量，用于UI空间分配
  getTaskCount(): number {
    return this.taskStates.size;
  }

  // 检查是否有活跃任务
  hasActiveTasks(): boolean {
    return Array.from(this.taskStates.values()).some(
      state => state.status === 'running' || state.status === 'pending'
    );
  }
}