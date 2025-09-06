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
    
    // 创建主任务和子任务
    const tasks: ListrTask[] = [
      {
        title: chalk.bold(`🚀 ${description}`),
        task: (_ctx, task) => {
          // 显示 prompt 信息
          if (prompt) {
            const shortPrompt = prompt.length > 100 
              ? prompt.substring(0, 97) + '...' 
              : prompt;
            task.output = chalk.dim(`Prompt: ${shortPrompt}`);
          }

          // 创建子任务来显示执行进度
          return task.newListr([
            {
              title: chalk.dim('Initializing subtask...'),
              task: async (_ctx, subtask) => {
                await this.waitForTaskInit(part, subtask);
              }
            },
            {
              title: chalk.dim('Running subtask...'),
              task: async (_ctx, subtask) => {
                await this.waitForSubtaskCompletion(part, subtask, taskId);
              }
            },
            {
              title: chalk.dim('Processing results...'),
              skip: () => part.state === 'output-error',
              task: async (_ctx, subtask) => {
                await this.processTaskResult(part, subtask);
              }
            }
          ], { 
            concurrent: false,
            rendererOptions: {
              showSubtasks: true,
              collapse: false,
              collapseSkips: false
            }
          });
        }
      }
    ];

    this.listr = new Listr(tasks, {
      concurrent: false,
      exitOnError: false,
      rendererOptions: {
        showSubtasks: true,
        collapse: false,
        collapseErrors: false,
        showTimer: true,
        clearOutput: false,
        formatOutput: 'wrap'
      }
    });

    this.isRunning = true;
    
    // 异步运行，不阻塞主流程
    this.listr.run()
      .then(() => {
        // listr 任务完成，不输出任何额外消息
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
  private async waitForTaskInit(
    part: ToolUIPart<UITools>, 
    task: any
  ): Promise<void> {
    task.output = chalk.dim('Setting up environment...');
    
    // 等待状态变化到 input-available 或更高
    await this.waitForState(part, ['input-available', 'output-available', 'output-error']);
    
    task.title = chalk.green('✓ Subtask initialized');
  }

  /**
   * 等待子任务完成（简化版本，主要依赖工具状态）
   */
  private async waitForSubtaskCompletion(
    part: ToolUIPart<UITools>,
    task: any,
    taskId?: string
  ): Promise<void> {
    return new Promise((resolve) => {
      let dots = 0;
      let currentStep = 'Executing subtask';
      let attemptCompletionFound = false;
      let iterations = 0;
      const maxIterations = 300; // 最多 60 秒 (300 * 200ms)
      
      const interval = setInterval(() => {
        iterations++;
        
        // 超时保护
        if (iterations >= maxIterations) {
          clearInterval(interval);
          task.title = chalk.yellow('⚠ Subtask timeout');
          task.output = chalk.dim('Task may still be running in background');
          debugLogger.debug(`Subtask timeout after ${maxIterations * 200}ms for task ${taskId}`);
          resolve();
          return;
        }
        // 更新执行动画
        dots = (dots + 1) % 4;
        const ellipsis = '.'.repeat(dots);
        task.output = chalk.dim(`${currentStep}${ellipsis}`);
        
        // 首先检查工具完成状态 - 这是最可靠的信号
        if (part.state === 'output-available') {
          clearInterval(interval);
          task.title = chalk.green('✓ Subtask completed');
          if (part.output && 'result' in part.output) {
            const result = (part.output as any).result as string;
            const shortResult = result.length > 50 
              ? result.substring(0, 47) + '...' 
              : result;
            task.output = chalk.dim(`Result: ${shortResult}`);
          } else {
            task.output = chalk.dim('Subtask finished successfully');
          }
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
              task.title = chalk.green('✓ Subtask completed');
              task.output = chalk.dim(`Result: ${hasAttemptCompletion.result}`);
              debugLogger.debug(`AttemptCompletion detected early! Stopping listr for task ${taskId}`);
              resolve();
              return;
            }
          } else {
            // 如果 subtask runner 已经不存在，说明任务已经完成，停止检查
            debugLogger.debug(`Subtask runner no longer exists for task ${taskId}, assuming completed`);
            clearInterval(interval);
            task.title = chalk.green('✓ Subtask completed');
            task.output = chalk.dim('Task finished successfully');
            resolve();
            return;
          }
        }
        
        // 检查错误状态
        if (part.state === 'output-error') {
          clearInterval(interval);
          task.title = chalk.red('✗ Subtask execution failed');
          task.output = chalk.dim(part.errorText || 'Unknown error');
          resolve();
          return;
        }

        // 根据工具状态更新显示文本
        if (part.state === 'input-streaming') {
          currentStep = 'Processing AI response';
        } else if (part.state === 'input-available') {
          currentStep = 'Finalizing subtask';
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
  private async processTaskResult(
    part: ToolUIPart<UITools>,
    task: any
  ): Promise<void> {
    task.output = chalk.dim('Collecting results...');
    
    // 等待一小段时间以确保结果完整
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (part.state === 'output-available' && part.output && 'result' in part.output) {
      const result = (part.output as any).result as string;
      const shortResult = result.length > 80 
        ? result.substring(0, 77) + '...' 
        : result;
      task.title = chalk.green('✓ Results ready');
      task.output = chalk.dim(`Result: ${shortResult}`);
    } else {
      task.title = chalk.green('✓ Processing complete');
    }
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