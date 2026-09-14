import type {
  BackgroundJobNotification,
  MonitorEventEnvelope,
} from "@getpochi/common";
import type { BackgroundCommands } from "@getpochi/common/vscode-webui-bridge";
import type { Message } from "@getpochi/livekit";

export type JobStatus =
  | "running"
  | "completed"
  | "failed"
  | "stopped"
  | "finished";

export interface BackgroundJobEntry {
  backgroundJobId: string;
  displayId?: string;
  title: string;
  command?: string;
  monitor?: string;
  status: JobStatus;
  exitCode?: number;
  outputFile?: string;
}

/** Collects the background commands Pochi started for this task. */
export function buildBackgroundJobList({
  messages,
  notifications,
  backgroundCommands,
  monitorEvents = [],
}: {
  messages: readonly Message[];
  notifications: readonly BackgroundJobNotification[];
  monitorEvents?: readonly MonitorEventEnvelope[];
  backgroundCommands: BackgroundCommands | undefined;
}): BackgroundJobEntry[] {
  const commands = new Map<
    string,
    { command?: string; outputFile?: string; monitor?: string }
  >();
  const finished = new Map<string, BackgroundJobNotification>();
  const monitors = new Map<string, MonitorEventEnvelope>();
  const rememberMonitor = (event: MonitorEventEnvelope) => {
    monitors.set(event.backgroundJobId, event);
  };

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
        part.type === "tool-startMonitor" &&
        part.state !== "input-streaming" &&
        part.output?.backgroundJobId
      ) {
        if (!commands.has(part.output.backgroundJobId))
          commands.set(part.output.backgroundJobId, {
            command: part.input?.command,
            outputFile: part.output.outputFile,
            monitor: part.input?.description,
          });
      } else if (part.type === "data-monitor-events") {
        for (const event of part.data.batches) rememberMonitor(event);
      } else if (part.type === "data-background-job-notification") {
        finished.set(part.data.backgroundJobId, part.data);
      }
    }
  }
  for (const notification of notifications) {
    finished.set(notification.backgroundJobId, notification);
  }

  for (const event of monitorEvents) rememberMonitor(event);
  const backgroundJobs: BackgroundJobEntry[] = [];
  let index = 0;
  for (const [backgroundJobId, meta] of commands) {
    index += 1;
    const notification = finished.get(backgroundJobId);
    const monitor = monitors.get(backgroundJobId);
    const command = meta.command ?? monitor?.command ?? notification?.command;
    const description = meta.monitor ?? monitor?.description;
    const isRunning = backgroundCommands?.[backgroundJobId] !== undefined;
    backgroundJobs.push({
      backgroundJobId,
      displayId: `%${index}`,
      title: description ?? command ?? backgroundJobId,
      command,
      ...(description !== undefined ? { monitor: description } : {}),
      status: isRunning
        ? "running"
        : (monitor?.ended?.status ?? notification?.status ?? "finished"),
      exitCode: isRunning
        ? undefined
        : (monitor?.ended?.exitCode ?? notification?.exitCode),
      outputFile:
        meta.outputFile ?? monitor?.outputFile ?? notification?.outputFile,
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

  for (const event of monitors.values()) {
    if (commands.has(event.backgroundJobId)) continue;
    orphaned.push({
      backgroundJobId: event.backgroundJobId,
      title: event.description,
      monitor: event.description,
      command: event.command,
      outputFile: event.outputFile,
      status: backgroundCommands?.[event.backgroundJobId]
        ? "running"
        : (event.ended?.status ?? "finished"),
      exitCode: event.ended?.exitCode,
    });
  }

  // Newest command first, with the `%N` labels still counting from the start
  // of the task.
  return [...backgroundJobs.reverse(), ...orphaned];
}
