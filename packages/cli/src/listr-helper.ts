import { Listr, type ListrTask } from 'listr2';
import type { ToolUIPart } from "ai";
import type { UITools } from "@getpochi/livekit";
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { renderToolPart } from './output-renderer';

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
          let output = '';
          
          // 显示 prompt 信息
          if (prompt) {
            const shortPrompt = prompt.length > 150 
              ? prompt.substring(0, 147) + '...' 
              : prompt;
            output += `${chalk.dim(`› Prompt: ${shortPrompt}`)}\n`;
          }

          // 初始化阶段
          output += `${chalk.dim('› Setting up environment...')}\n`;
          task.output = output;
          await this.waitForTaskInit(part);
          output += `${chalk.green('› ✓ Subtask initialized')}\n`;

          // 执行阶段
          output += `${chalk.dim('› Executing subtask...')}\n`;
          task.output = output;
          
          // 启动工具监听，但不阻塞
          this.startToolMonitoring(taskId, (toolPart: ToolUIPart<UITools>) => {
            const { text } = renderToolPart(toolPart);
            output += `${chalk.cyan(`  › ${text}`)}\n`;
            task.output = output;
          });
          
          // 等待任务完成
          await this.waitForSubtaskCompletion(part, taskId);
          
          output += `${chalk.green('› ✓ Subtask completed')}\n`;
          
          // 获取最终的工具列表
          const usedTools = this.getUsedTools(taskId);
          if (usedTools.length > 0) {
            output += `${chalk.dim(`› Tools used: ${usedTools.length} tool(s)`)}\n`;
          }

          // 结果处理阶段
          if (part.state !== 'output-error') {
            output += `${chalk.dim('› Processing results...')}\n`;
            task.output = output;
            await this.processTaskResult(part);
            
            // 显示最终结果
            if (part.output && 'result' in part.output) {
              const result = (part.output as any).result as string;
              output += `${chalk.green('› ✓ Results processed')}\n`;
              output += `${chalk.dim(`  Result: ${result}`)}\n`;
              
              // 显示执行的命令详情（如果是 executeCommand）
              const input = part.input as any;
              if (input?.command) {
                output += `${chalk.dim(`  Command: ${input.command}`)}\n`;
              }
              if (input?.cwd) {
                output += `${chalk.dim(`  Working directory: ${input.cwd}`)}\n`;
              }
            } else {
              output += `${chalk.green('› ✓ Processing complete')}\n`;
            }
            
            task.output = output;
          } else {
            // 错误情况
            output += `${chalk.red('› ✗ Subtask failed')}\n`;
            if (part.errorText) {
              output += `${chalk.dim(`  Error: ${part.errorText}`)}\n`;
            }
            task.output = output;
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

  // 存储工具监听的状态
  private toolMonitors = new Map<string, {
    tools: string[],
    interval?: NodeJS.Timeout,
    lastProcessedMessageIndex: number
  }>();

  /**
   * 启动工具监听（非阻塞）
   */
  private startToolMonitoring(taskId: string, onToolUse: (toolPart: ToolUIPart<UITools>) => void): void {
    if (this.toolMonitors.has(taskId)) return;
    
    const monitor: {
      tools: string[],
      interval?: NodeJS.Timeout,
      lastProcessedMessageIndex: number
    } = {
      tools: [],
      lastProcessedMessageIndex: -1
    };
    
    this.toolMonitors.set(taskId, monitor);
    
    monitor.interval = setInterval(() => {
      const subTaskRunner = ListrHelper.getSubTaskRunner(taskId);
      if (subTaskRunner) {
        const messages = subTaskRunner.state?.messages || [];
        
        // 重新检查所有消息，确保不遗漏
        for (let i = 0; i < messages.length; i++) {
          const message = messages[i];
          if (message.role === 'assistant') {
            for (const msgPart of message.parts || []) {
              if (msgPart.type?.startsWith('tool-')) {
                // 任务完成标志不作为普通工具显示
                if (msgPart.type === 'tool-attemptCompletion' || msgPart.type === 'tool-askFollowupQuestion') {
                  continue;
                }
                const toolName = msgPart.type.replace('tool-', '');
                debugLogger.debug(`Tool part found: ${toolName}`, JSON.stringify(msgPart, null, 2));
                
                if (!monitor.tools.includes(toolName)) {
                  monitor.tools.push(toolName);
                  debugLogger.debug(`Tool detected: ${toolName} - calling onToolUse callback`);
                  
                  const toolPart = msgPart as ToolUIPart<UITools>;
                  try {
                    onToolUse(toolPart);
                    debugLogger.debug(`onToolUse callback executed successfully for ${toolName}`);
                  } catch (error) {
                    debugLogger.debug(`Error in onToolUse callback: ${error}`);
                  }
                }
              }
            }
          }
        }
        monitor.lastProcessedMessageIndex = messages.length - 1;
      }
    }, 100);
  }

  /**
   * 获取已使用的工具
   */
  private getUsedTools(taskId: string): string[] {
    const monitor = this.toolMonitors.get(taskId);
    return monitor?.tools || [];
  }

  /**
   * 清理工具监听
   */
  private cleanupToolMonitoring(taskId: string): void {
    const monitor = this.toolMonitors.get(taskId);
    if (monitor?.interval) {
      clearInterval(monitor.interval);
    }
    this.toolMonitors.delete(taskId);
  }

  /**
   * 等待子任务完成（简化版本，主要依赖工具状态）
   */
  private async waitForSubtaskCompletion(
    part: ToolUIPart<UITools>,
    taskId?: string
  ): Promise<void> {
    return new Promise((resolve) => {
      let iterations = 0;
      const maxIterations = 300; // 最多 60 秒 (300 * 200ms)
      
      const interval = setInterval(() => {
        iterations++;
        
        // 超时保护
        if (iterations >= maxIterations) {
          clearInterval(interval);
          debugLogger.debug(`Subtask timeout after ${maxIterations * 200}ms for task ${taskId}`);
          if (taskId) this.cleanupToolMonitoring(taskId);
          resolve();
          return;
        }
        
        // 检查工具完成状态
        if (part.state === 'output-available') {
          clearInterval(interval);
          debugLogger.debug(`Subtask completed via output-available for task ${taskId}`);
          if (taskId) this.cleanupToolMonitoring(taskId);
          resolve();
          return;
        }
        
        // 检查任务完成标志：attemptCompletion 或 askFollowupQuestion
        if (taskId) {
          const subTaskRunner = ListrHelper.getSubTaskRunner(taskId);
          if (subTaskRunner) {
            // 直接检查最新消息中的任务完成标志
            const messages = subTaskRunner.state?.messages || [];
            for (const message of messages) {
              if (message.role === 'assistant') {
                for (const msgPart of message.parts || []) {
                  if (msgPart.type === 'tool-attemptCompletion' || msgPart.type === 'tool-askFollowupQuestion') {
                    clearInterval(interval);
                    debugLogger.debug(`${msgPart.type} detected! Stopping for task ${taskId}`);
                    this.cleanupToolMonitoring(taskId);
                    resolve();
                    return;
                  }
                }
              }
            }
          }
        }
        
        // 检查错误状态
        if (part.state === 'output-error') {
          clearInterval(interval);
          if (taskId) this.cleanupToolMonitoring(taskId);
          resolve();
          return;
        }
      }, 200);
    });
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