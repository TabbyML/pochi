import {
  type BackgroundCommandNotification,
  type BackgroundJobNotification,
  getSubAgentBackgroundJobId,
  getSubAgentNotificationId,
} from "@getpochi/common";
import type { BackgroundCommands } from "@getpochi/common/vscode-webui-bridge";
import type { Message, Task } from "../types";

export type JobStatus =
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "finished";

export interface BackgroundJobEntry {
  backgroundJobId: string;
  displayId?: string;
  taskId?: string;
  agentType?: string;
  notificationPending?: boolean;
  title: string;
  command?: string;
  status: JobStatus;
  exitCode?: number;
  outputFile?: string;
}

/** Collects the background commands Pochi started for this task. */
export function buildBackgroundJobList({
  messages,
  notifications,
  backgroundCommands,
  subTasks = [],
}: {
  messages: readonly Message[];
  notifications: readonly BackgroundJobNotification[];
  backgroundCommands: BackgroundCommands | undefined;
  subTasks?: readonly Task[];
}): BackgroundJobEntry[] {
  const commands = new Map<string, { command?: string; outputFile?: string }>();
  const finished = new Map<string, BackgroundCommandNotification>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "tool-executeCommand" &&
        part.state !== "input-streaming" &&
        part.output?._meta?.backgroundJobId
      ) {
        const { backgroundJobId, outputFile } = part.output._meta;
        // First occurrence wins so the `%N` numbering stays stable.
        if (!commands.has(backgroundJobId)) {
          commands.set(backgroundJobId, {
            command: part.input?.command,
            outputFile,
          });
        }
      } else if (
        part.type === "data-background-job-notification" &&
        part.data.kind !== "subagent"
      ) {
        finished.set(part.data.backgroundJobId, part.data);
      }
    }
  }
  for (const notification of notifications) {
    if (notification.kind !== "subagent")
      finished.set(notification.backgroundJobId, notification);
  }

  const backgroundJobs: BackgroundJobEntry[] = [];
  let index = 0;
  for (const [backgroundJobId, meta] of commands) {
    index += 1;
    const notification = finished.get(backgroundJobId);
    const command = meta.command ?? notification?.command;
    const isRunning = backgroundCommands?.[backgroundJobId] !== undefined;
    backgroundJobs.push({
      backgroundJobId,
      displayId: `%${index}`,
      title: command ?? backgroundJobId,
      command,
      status: isRunning ? "running" : (notification?.status ?? "finished"),
      exitCode: isRunning ? undefined : notification?.exitCode,
      outputFile: meta.outputFile ?? notification?.outputFile,
    });
  }

  // A notification can outlive the `executeCommand` part that started it,
  // because compaction rewrites older messages.
  const orphaned: BackgroundJobEntry[] = [];
  for (const notification of finished.values()) {
    if (commands.has(notification.backgroundJobId)) continue;
    orphaned.push({
      backgroundJobId: notification.backgroundJobId,
      title: notification.command ?? notification.backgroundJobId,
      command: notification.command,
      status: notification.status,
      exitCode: notification.exitCode,
      outputFile: notification.outputFile,
    });
  }

  // Newest command first, with the `%N` labels still counting from the start
  // of the task.
  const delivered = new Set<string>();
  const agents = new Map<string, string>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "data-background-job-notification") {
        delivered.add(part.data.notificationId);
      }
      if (
        part.type === "tool-newTask" &&
        part.input?._meta?.uid &&
        part.input.agentType
      ) {
        agents.set(part.input._meta.uid, part.input.agentType);
      }
    }
  }
  const subagents: BackgroundJobEntry[] = subTasks
    .filter((task) => task.background)
    .map((task) => {
      const done = task.status === "completed" || task.status === "failed";
      return {
        backgroundJobId: getSubAgentBackgroundJobId(task.id),
        taskId: task.id,
        title: task.title || getSubAgentBackgroundJobId(task.id),
        agentType: agents.get(task.id),
        status:
          task.status === "failed"
            ? task.error?.kind === "AbortError"
              ? "stopped"
              : "failed"
            : task.status === "completed"
              ? "completed"
              : "running",
        notificationPending:
          done && !delivered.has(getSubAgentNotificationId(task)),
      };
    });
  return [...backgroundJobs.reverse(), ...orphaned, ...subagents];
}
