import { Listr, type ListrTask } from 'listr2';
import type { ToolUIPart } from "ai";
import type { UITools } from "@getpochi/livekit";
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

// 创建调试日志文件写入器
const debugLogFile = path.join(process.cwd(), '.pochi-debug.log');

// 初始化时清空日志文件
let logFileInitialized = false;

const debugLogger = {
  debug: (message: string, ...args: any[]) => {
    if (!logFileInitialized) {
      fs.writeFileSync(debugLogFile, ''); // 清空文件
      logFileInitialized = true;
    }
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [ListrHelper] ${message} ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')}\n`;
    fs.appendFileSync(debugLogFile, logLine);
  },
  error: (message: string, ...args: any[]) => {
    if (!logFileInitialized) {
      fs.writeFileSync(debugLogFile, ''); // 清空文件
      logFileInitialized = true;
    }
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [ListrHelper ERROR] ${message} ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')}\n`;
    fs.appendFileSync(debugLogFile, logLine);
  }
};

// 全局存储当前子任务运行器的注册表
const activeSubTaskRunners = new Map<string, any>();

export class ListrHelper {
  private listr: Listr | null = null;
  private isRunning = false;

  /**
   * 注册子任务运行器供 Listr 监听使用
   */
  static registerSubTaskRunner(taskId: string, runner: any): void {
    debugLogger.debug(`Registering subtask runner for task: ${taskId}`);
    activeSubTaskRunners.set(taskId, runner);
    debugLogger.debug(`Active subtask runners count: ${activeSubTaskRunners.size}`);
  }

  /**
   * 注销子任务运行器
   */
  static unregisterSubTaskRunner(taskId: string): void {
    debugLogger.debug(`Unregistering subtask runner for task: ${taskId}`);
    activeSubTaskRunners.delete(taskId);
    debugLogger.debug(`Active subtask runners count: ${activeSubTaskRunners.size}`);
  }

  /**
   * 获取子任务运行器
   */
  static getSubTaskRunner(taskId: string): any {
    const runner = activeSubTaskRunners.get(taskId);
    debugLogger.debug(`Getting subtask runner for task: ${taskId}, found: ${!!runner}`);
    return runner;
  }

  /**
   * 为 newTask 创建并运行 Listr 任务
   * 显示子任务的执行进度（异步，非阻塞）
   */
  renderNewTask(part: ToolUIPart<UITools>): void {
    if (part.type !== "tool-newTask") return;
    
    const { description = "Creating subtask", prompt, _meta } = part.input || {};
    // 使用 toolCallId 作为标识符，这样更可靠
    const taskId = part.toolCallId;
    
    debugLogger.debug(`Starting listr render for newTask: ${description}, taskId: ${taskId} (from toolCallId)`);
    debugLogger.debug(`_meta?.uid: ${_meta?.uid}`);
    debugLogger.debug(`Full input:`, JSON.stringify(part.input, null, 2));
    // 创建主任务
    const tasks: ListrTask[] = [
      {
        title: chalk.bold(`🚀 ${description}`),
        task: async (_ctx, task) => {
          // 显示 prompt 信息
          if (prompt) {
            const shortPrompt = prompt.length > 100 
              ? prompt.substring(0, 97) + '...' 
              : prompt;
            task.output = chalk.dim(`› Prompt: ${shortPrompt}`);
          }

          // 初始化阶段
          task.output = chalk.dim('› Setting up environment...');
          await this.waitForTaskInit(part);
          task.output = chalk.dim('› ✓ Subtask initialized');

          // 执行阶段
          task.output = chalk.dim('› Executing subtask...');
          await this.waitForSubtaskCompletion(part, taskId);
          task.output = chalk.dim('› ✓ Subtask completed');

          // 结果处理阶段
          if (part.state !== 'output-error') {
            task.output = chalk.dim('› Processing results...');
            await this.processTaskResult(part);
            
            // 显示最终结果
            if (part.output && 'result' in part.output) {
              const result = (part.output as any).result as string;
              const shortResult = result.length > 80 
                ? result.substring(0, 77) + '...' 
                : result;
              task.output = `${chalk.dim('› ✓ Results processed')}\n${chalk.dim(`  Result: ${shortResult}`)}`;
            } else {
              task.output = chalk.dim('› ✓ Processing complete');
            }
          }
        },
        // 关键：在任务级别设置 persistentOutput
        rendererOptions: { persistentOutput: true }
      }
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
        formatOutput: 'wrap',
        persistentOutput: true,
        removeEmptyLines: false,
        suffixSkips: false
      }
    });

    this.isRunning = true;
    
    // 异步运行，不阻塞主流程
    this.listr.run()
      .then(() => {
        debugLogger.debug(`Listr completed for task ${taskId}`);
      })
      .catch((error) => {
        if (error?.message) {
          // 只在日志中记录错误，不在控制台输出
          debugLogger.error(`Listr failed for task ${taskId}: ${error.message}`);
        }
      })
      .finally(() => {
        this.isRunning = false;
        this.listr = null;
      });
  }

  /**
   * 等待任务初始化
   */
  private async waitForTaskInit(part: ToolUIPart<UITools>): Promise<void> {
    // 等待状态变化到 input-available 或更高
    await this.waitForState(part, ['input-available', 'output-available', 'output-error']);
  }

  /**
   * 等待子任务完成（简化版本，主要依赖工具状态）
   */
  private async waitForSubtaskCompletion(
    part: ToolUIPart<UITools>,
    taskId?: string
  ): Promise<void> {
    return new Promise((resolve) => {
      let attemptCompletionFound = false;
      let iterations = 0;
      const maxIterations = 300; // 最多 60 秒 (300 * 200ms)
      
      const interval = setInterval(() => {
        iterations++;
        
        // 超时保护
        if (iterations >= maxIterations) {
          clearInterval(interval);
          debugLogger.debug(`Subtask timeout after ${maxIterations * 200}ms for task ${taskId}`);
          resolve();
          return;
        }
        
        // 首先检查工具完成状态 - 这是最可靠的信号
        if (part.state === 'output-available') {
          clearInterval(interval);
          debugLogger.debug(`Subtask completed via output-available, stopping listr for task ${taskId}`);
          resolve();
          return;
        }
        
        // 尝试提前检测 attemptCompletion（优化用户体验）
        if (taskId && !attemptCompletionFound) {
          const subTaskRunner = ListrHelper.getSubTaskRunner(taskId);
          if (subTaskRunner) {
            const hasAttemptCompletion = this.checkForAttemptCompletion(subTaskRunner);
            if (hasAttemptCompletion.found) {
              attemptCompletionFound = true;
              clearInterval(interval);
              debugLogger.debug(`AttemptCompletion detected early! Stopping listr for task ${taskId}`);
              resolve();
              return;
            }
          } else {
            // 如果 subtask runner 已经不存在，说明任务已经完成，停止检查
            debugLogger.debug(`Subtask runner no longer exists for task ${taskId}, assuming completed`);
            clearInterval(interval);
            resolve();
            return;
          }
        }
        
        // 检查错误状态
        if (part.state === 'output-error') {
          clearInterval(interval);
          resolve();
          return;
        }
      }, 200); // 减少检查间隔以提高响应速度
    });
  }

  /**
   * 检查子任务运行器中是否出现了 attemptCompletion
   */
  private checkForAttemptCompletion(subTaskRunner: any): { found: boolean; result?: string } {
    const state = subTaskRunner.state;
    const messages = state.messages || [];
    
    debugLogger.debug(`Checking messages in subtask runner, total messages: ${messages.length}`);
    
    // 查找最新的 assistant 消息中的 attemptCompletion
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      debugLogger.debug(`Checking message ${i}: role=${message.role}, parts=${message.parts?.length || 0}`);
      
      if (message.role === 'assistant') {
        for (const part of message.parts || []) {
          debugLogger.debug(`Checking part: type=${part.type}`);
          if (part.type === 'tool-attemptCompletion') {
            const result = part.input?.result || 'Task completed';
            const shortResult = result.length > 50 
              ? result.substring(0, 47) + '...' 
              : result;
            debugLogger.debug(`Found attemptCompletion! Result: ${result}`);
            return { found: true, result: shortResult };
          }
        }
      }
    }
    
    return { found: false };
  }

  /**
   * 处理任务结果
   */
  private async processTaskResult(_part: ToolUIPart<UITools>): Promise<void> {
    // 等待一小段时间以确保结果完整
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  /**
   * 等待特定状态
   */
  private async waitForState(
    part: ToolUIPart<UITools>,
    targetStates: string[]
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
   * 停止当前运行的 Listr
   */
  stop(): void {
    if (this.isRunning && this.listr) {
      this.isRunning = false;
      this.listr = null;
    }
  }

  /**
   * 检查是否正在运行
   */
  get running(): boolean {
    return this.isRunning;
  }
}