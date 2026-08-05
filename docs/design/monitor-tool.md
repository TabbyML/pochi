# Monitor Tool 设计文档

> 状态：Phase 1 + Phase 2 已实现（command 源、两端事件注入闭环、限流自动停、environment 标注、webui 组件与 i18n）。ws 源不做。
> 参考：[Claude Code Monitor tool](https://code.claude.com/docs/en/tools-reference#monitor-tool)

## 1. 背景与目标

Monitor tool 让 agent 在后台监听某个事件源，事件发生时**主动推送进对话**，agent 无需轮询、可以继续做别的事。典型场景：

- tail 日志文件，出现 ERROR 时提醒
- 轮询 PR / CI 状态，状态变化时汇报
- 监听目录文件变化
- 跟踪长时间运行脚本的输出
- 连接 WebSocket feed，每条消息到达时汇报

核心语义（对齐 Claude Code）：

- 输入 `command`（shell 脚本），加 `description`、`timeoutMs`、`persistent`
  （Claude Code 还支持 `ws` WebSocket 源，**本设计暂不支持**，见第 4.3 节）
- 后台运行，**stdout 每一行 = 一个事件**，事件主动注入对话
- 200ms 内的多行合并为一条通知
- 脚本退出 / 超时 / 被 kill 则结束监听，退出本身也是一个事件
- 事件永远在推理轮次之间、以标记过的 user message 形式进入上下文

## 2. 核心设计决策：Monitor = Background Job + 事件订阅层

**Monitor 不是一个独立的任务体系，而是在现有 background job 上附加一个
行级事件 watcher。** 没有独立的 monitor ID——`startMonitor` 返回的就是
`backgroundJobId`，进程管理、输出缓冲、kill、终端可视化全部复用现有设施：

| 能力 | 复用自 | 需要的改动 |
|---|---|---|
| 进程启动 / 终止 | VSCode `TerminalJob`、CLI `BackgroundJobManager` | 无 |
| 用户可见 / 可管理 | VSCode 真实 terminal（用户关终端即停止监听） | 无 |
| 输出缓冲与截断 | `OutputManager` / `job.output` | 无 |
| `readBackgroundJobOutput` | 按 ID 读历史输出 | 无（watcher 独立于 lastRead 指针，互不干扰） |
| `killBackgroundJob` | 按 ID 停止 | 无 |
| environment prompt | "Opened Terminals" 段已列出 `backgroundJobId` | 可选：标注哪些 job 挂了 watcher |
| **事件推送** | —— | **新增：MonitorWatcher + 注入通道（本文重点）** |

与拉模式的分工不变：`startBackgroundJob` 适合「只要一次结果」（构建、测试），
`startMonitor` 适合「每次发生都要知道」（日志监听、CI 轮询）。后者只是多挂了
一个 watcher 的 background job。

## 3. 工具定义（`packages/tools/src/monitor.ts`）

```ts
export const startMonitor = defineClientTool({
  description: "...", // 强调：每行 stdout 是一个事件；只要一次通知请用 startBackgroundJob
  inputSchema: z.object({
    command: z.string(),
    description: z.string(),
    cwd: z.string().optional(),
    timeoutMs: z.number().max(3_600_000).optional(), // 默认 300000
    persistent: z.boolean().optional(),
  }),
  outputSchema: z.object({
    backgroundJobId: z.string().optional(), // 就是普通的 background job ID
    error: z.string().optional(),
  }),
});
```

配套改动：

- `packages/tools/src/index.ts` — 注册进 `createClientTools`（及 `createCliTools`），
  类型自动传播到 `packages/livekit` 的 `UITools`
- `packages/tools/src/constants.ts` — `ToolsByPermission` 归入 `execute` 组
  （与 executeCommand 共享权限规则，对齐 Claude Code 行为）
- `packages/tools/src/utils/tool-batch.ts` — 启动是 fire-and-forget，
  标记 batch-safe（同 `startBackgroundJob`）
- `startBackgroundJob` / `readBackgroundJobOutput` / `killBackgroundJob` 的
  description 补充说明与 monitor 的关系（stop monitor = `killBackgroundJob`）

> 备选方案：给 `startBackgroundJob` 加可选 `monitor` 参数而非独立工具。
> 不采用——独立工具的 description 能更清晰地引导模型在「一次通知 vs 每次通知」
> 之间做选择（Claude Code 也是独立工具），但实现层两者共享同一条创建路径。

## 4. MonitorWatcher（事件提取层）

公共实现放 `packages/common/src/base/monitor/`，是一个无宿主依赖的
chunk 消费者，两端复用：

```
chunk → 去 ANSI 转义 → 拼接残行缓冲 → 按行切分 → 200ms 合批 → 限流检查 → emit MonitorEventBatch
```

- 输入是原始输出 chunk（可能截断在行中间、VSCode 侧含 ANSI 转义），
  watcher 内部维护 partial-line buffer
- job 退出时 flush 残行并 emit 一条终止事件（含退出码/原因）
- 限流：超过阈值（如 10 事件/分钟）kill 底层 job，最后一条事件为
  「因输出过多已停止，请用更严的过滤条件重启」，引导模型自我修正
- `timeoutMs`：watcher 起一个定时器到期调 `kill`；`persistent: true` 不设定时器

### 4.1 VSCode 挂载点

**完整复用 `TerminalJob`**（`packages/vscode/src/integrations/terminal/terminal-job.ts`）：
monitor command 跑在真实 vscode terminal 里，用户能看到、能切换、能手动关闭
（关闭终端即结束监听，`TerminalJob` 的 dispose 流程已处理）。

挂载点是 `processOutputStream`（`terminal-job.ts:193-199`）：每个
`execution.read()` chunk 在写入 `OutputManager` 的同时喂给 watcher。
实现上给 `TerminalJobConfig` 加一个可选 `watcher` 字段即可，不影响
`startBackgroundJob` 的既有路径。job 结束的 `finalize`（`terminal-job.ts:136`）
触发 watcher 的终止事件。

### 4.2 CLI 挂载点

复用 `BackgroundJobManager.start`（`packages/cli/src/lib/background-job-manager.ts:21`）：
加可选 `watcher` 参数，在 `child.stdout.on("data")`（`background-job-manager.ts:58`）
处喂 watcher——注意只 tap stdout，stderr 按 Claude Code 语义只进输出缓冲区
（可被 `readBackgroundJobOutput` 读到），不产生事件。`close` / `error` 回调
（`background-job-manager.ts:61-69`）触发终止事件。

### 4.3 WebSocket 源（暂不支持）

Claude Code 的 Monitor 还支持 `ws` 源（直连 WebSocket，每个 text frame
一个事件）。**决定暂不支持**：需要 ws 监听时模型可以用 `command` 跑一个
ws 客户端脚本达到同样效果。若未来支持，方案是每个 frame 直接喂 watcher
（跳过行切分），并分配伪 background job ID 注册进同一套注册表。

## 5. 事件注入（核心新增部分）

统一语义：**事件在两轮推理之间、以一条携带 `data-monitor-events` data part 的
user message 进入上下文**（照抄 `data-bash-outputs` 模式）：

- **LLM 路径**：chat transport 的 `convertDataPartToText` 把 data part 渲染为
  `formatMonitorNotifications` 生成的 system-reminder 文本（与
  `createAsyncResultsMessage` 等既有非用户通知一致）
- **UI 路径**：data part 保留，由 `MonitorEventsPart` 组件渲染成可见的事件卡片
  （Radar 图标 + description + 事件行），聊天历史里留有痕迹——纯 reminder 文本
  会被 UI 隐藏，事件在空闲时被立即消费后将完全不可见，data part 解决这个问题

LLM 收到的文本：

```
<system-reminder>The following events were captured by background monitors started with startMonitor. This is an automated notification, not user input:
Monitor "errors in dev.log" (backgroundJobId: bgjob-xxx):
[line 1]
[line 2]
[monitor ended: exited with code 0]</system-reminder>
```

### 5.1 VSCode：复用 Queue Message 机制

webview 已有完整的「排队 + 空闲时自动出队并触发新一轮推理」管道：

- `packages/vscode-webui/src/features/chat/components/chat-toolbar.tsx:128` —
  `queuedMessages: DraftMessage[]` 状态；agent 运行中提交的消息进队列
- `chat-toolbar.tsx:284-303` — auto-dequeue effect：`status === "ready"` 且
  `allowSendMessage` 且无 `pendingApproval` 且任务处于 `pending-input` / `completed` /
  新建状态时，自动取队首消息发送、触发新一轮推理

注入路径：

1. **Host 侧**：per-task 的 monitor 事件注册表持有未投递事件的 preact signal；
   `VSCodeHostApi`（`packages/common/src/vscode-webui-bridge/webview.ts`）新增
   `readMonitorEvents(taskId): Promise<ThreadSignalSerialization<MonitorEventBatch[]>>`，
   照抄 `readVisibleTerminals` 等十几处的 ThreadSignal 模式
2. **Webview 侧**：新 hook `useMonitorEvents(taskId)` 订阅 signal，把事件批次构造成
   `DraftMessage` append 进 `queuedMessages`，并向 host ack 已消费的事件
   （防止 webview 重载后重复投递）
3. **时序语义白捡**：现有 auto-dequeue 天然实现了 Monitor 行为——
   空闲 → 立即出队触发新一轮（agent 主动插话）；运行中 → 排队等本轮结束；
   任务已 `completed` 也能被事件唤醒。排队中的事件显示在 QueuedMessages UI 里，
   用户在送达模型前可见、可手动删除

细节：

- `DraftMessage.raw` 加可选 `monitor?: { backgroundJobId: string; description: string }`
  字段，`queued-messages.tsx` 渲染成带 "Monitor" 徽标的样式，与用户草稿区分
- **入队合并**：新事件到达时，若队尾已有未发送的 monitor 草稿，则把 envelope
  并入并重新渲染为一条通知（`raw.monitor.envelopes` 保留原始事件），避免一次
  刷屏产生 N 条队列消息、触发 N 轮推理。只并入队尾，不跨越用户排队的消息，
  保证事件与用户输入的相对顺序

### 5.2 CLI：step 边界排空事件缓冲

CLI 没有（也不需要）Queue Message——`task-runner.ts` 的循环是自驱动的，
且已有功能等价的机制：`task-runner.ts:481-491` 在任务即将完成而 background job
还在跑时，`waitForAsyncWork()` 阻塞等待，拿到结果后用 `createAsyncResultsMessage`
注入 user message 并 `return "next"` 让循环继续。

Monitor 事件对应两个卡点：

1. **Agent 正在跑**（对应 webview 的「入队等本轮结束」）：`step()` 中
   `process()` 返回 `"next"` 之后、`sendMessage()`（`task-runner.ts:534`）之前，
   排空事件缓冲，有事件则 `appendOrReplaceMessage`
   一条 monitor-notification user message
2. **Agent 要收工**（对应 webview 的「空闲即插话」）：扩展 `task-runner.ts:481`
   的判断，除 `hasPendingJobs` 外加「是否有挂 watcher 的 job 还在跑」，
   复用 `waitForAsyncWork` 模式：等到事件 → 注入 → `"next"` 继续；
   所有 job 退出/超时 → 正常 finished

## 6. 生命周期与限流

- **合批**：watcher 内 200ms 合批（对齐 Claude Code）
- **限流自动停**：见第 4 节，kill 的就是底层 background job，
  终端里用户可见其被终止
- **超时**：`timeoutMs` 到期 kill 并通知；`persistent: true` 跳过超时
- **persistent 在 CLI 的降级语义**：CLI 是一次性进程，任务完成时的等待窗口
  以 `asyncWaitTimeoutInMs` 为界（与 background job 一致），超时即收工；
  `run()` 的 `finally`（`task-runner.ts:405` `killAll`）已保证退出清理，
  monitor job 天然包含在内
- **VSCode**：task 结束 / session 关闭沿用 background job 的清理路径；
  用户手动关终端 = 停止监听（`TerminalJob` 已有语义）
- **environment prompt**：`packages/common/src/base/prompts/environment.ts`
  的 "Opened Terminals" 段已列出所有 background job，monitor job 自动出现；
  可选增强：标注 `(monitoring: <description>)`，让模型区分并避免重复启动

## 7. Webui 渲染

- `packages/vscode-webui/src/features/tools/components/monitor.tsx` —
  描述 + 运行状态 + 最近事件，套 `BackgroundJobPanel` 的壳
  （终端跳转按钮直接复用，因为就是普通 background job 终端）
- 注册进 `components/index.tsx` 的 `Tools` 表和 `tool-call-lite.tsx` 的 switch
- i18n：`src/i18n/locales/{en,zh,jp,ko}.json` 的 `toolInvocation.*`
- 设置页说明：`features/settings/components/sections/tools-section.tsx`
- 未注册时 fallback 到通用 MCP 渲染，此层可最后做

## 8. 分期计划

| Phase | 内容 |
|---|---|
| 1 | `command` 源 + 工具定义 + MonitorWatcher + 两端挂载点（`TerminalJob` / `BackgroundJobManager` 加 watcher 参数）+ CLI 注入 + VSCode ThreadSignal 通道与 queuedMessages 注入闭环 |
| 2 | 限流自动停 + environment 标注 + webui 组件 + QueuedMessages 的 Monitor 徽标 |
| 3 | `persistent` 完整语义打磨（ws 源已决定不做） |

## 9. 涉及文件清单

新增：

- `packages/tools/src/monitor.ts`
- `packages/common/src/base/monitor/`（MonitorWatcher：ANSI 清洗 / 行切分 /
  合批 / 限流）
- `packages/cli/src/tools/monitor.ts`
- `packages/vscode/src/tools/monitor.ts`
- `packages/vscode-webui/src/features/chat/hooks/use-monitor-events.ts`
- `packages/vscode-webui/src/features/tools/components/monitor.tsx`

修改：

- `packages/tools/src/index.ts`（注册）、`constants.ts`（权限组）、
  `utils/tool-batch.ts`（batch-safe）、三个 background-job 工具的 description
- `packages/vscode/src/integrations/terminal/terminal-job.ts`
  （`TerminalJobConfig.watcher` + `processOutputStream` / `finalize` 喂 watcher）
- `packages/cli/src/lib/background-job-manager.ts`
  （`start` 加 watcher 参数，tap stdout / close / error）
- `packages/common/src/vscode-webui-bridge/webview.ts`（`readMonitorEvents`）
- `packages/common/src/base/prompts/environment.ts`（可选：monitoring 标注）
- `packages/vscode/src/integrations/webview/vscode-host-impl.ts`（ToolMap）
- `packages/cli/src/tools/index.ts`（ToolMap）、`packages/cli/src/task-runner.ts`
  （两处注入卡点）
- `packages/vscode-webui/src/features/chat/components/chat-toolbar.tsx`、
  `queued-messages.tsx`（Monitor 徽标）、
  `features/tools/components/index.tsx`、`tool-call-lite.tsx`、i18n、
  `tools-section.tsx`
