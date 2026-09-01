import type { BackgroundJobNotification } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";

export type JobStatus = "running" | "idle" | "completed" | "failed" | "stopped";

export interface JobListEntry {
  backgroundJobId: string;
  /** `%1`-style label, matching the badge shown inside the message list. */
  displayId?: string;
  title: string;
  /**
   * The command behind the row, shown on hover. Absent for a terminal that has
   * not run anything yet, which is exactly when there is nothing to say.
   */
  command?: string;
  status: JobStatus;
  /** Transcript to fall back to once the terminal is gone. */
  outputFile?: string;
  isActive: boolean;
}

/** The subset of `TerminalInfo` the list needs. */
export interface TerminalSnapshot {
  name: string;
  isActive: boolean;
  backgroundJobId?: string;
  outputFile?: string;
}

export interface JobList {
  /** Background commands Pochi started for this task. */
  pochi: JobListEntry[];
}

/**
 * Collects the background work worth surfacing in the manage panel.
 *
 * Pochi jobs are task-scoped, which falls out of only ever looking at this
 * task's messages. Their lifecycle is split across two complementary sources:
 * a notification waits in the host store until it has been delivered as a
 * `data-background-job-notification` message part, at which point the host
 * copy is dropped. Reading only one of them loses finished jobs, so both are
 * merged here.
 */
export function buildJobList({
  messages,
  notifications,
  terminals,
}: {
  messages: readonly Message[];
  notifications: readonly BackgroundJobNotification[];
  terminals: readonly TerminalSnapshot[] | undefined;
}): JobList {
  const commands = new Map<string, string | undefined>();
  const finished = new Map<string, BackgroundJobNotification>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "tool-executeCommand" &&
        part.state !== "input-streaming" &&
        part.input?.background === true &&
        part.output?._meta?.backgroundJobId
      ) {
        const backgroundJobId = part.output._meta.backgroundJobId;
        // First occurrence wins so the `%N` numbering stays stable, matching
        // `useBackgroundJobDisplay`.
        if (!commands.has(backgroundJobId)) {
          commands.set(backgroundJobId, part.input.command);
        }
      } else if (part.type === "data-background-job-notification") {
        finished.set(part.data.backgroundJobId, part.data);
      }
    }
  }
  for (const notification of notifications) {
    finished.set(notification.backgroundJobId, notification);
  }

  const liveJobs = new Map<string, TerminalSnapshot>();
  for (const terminal of terminals ?? []) {
    if (terminal.backgroundJobId) {
      liveJobs.set(terminal.backgroundJobId, terminal);
    }
  }

  const pochi: JobListEntry[] = [];
  let index = 0;
  for (const [backgroundJobId, command] of commands) {
    index += 1;
    const displayId = `%${index}`;
    const notification = finished.get(backgroundJobId);
    if (notification) {
      const resolvedCommand = command ?? notification.command;
      pochi.push({
        backgroundJobId,
        displayId,
        title: resolvedCommand ?? backgroundJobId,
        command: resolvedCommand,
        status: notification.status,
        outputFile: notification.outputFile,
        isActive: false,
      });
      continue;
    }

    const live = liveJobs.get(backgroundJobId);
    if (live) {
      pochi.push({
        backgroundJobId,
        displayId,
        title: command ?? backgroundJobId,
        command,
        status: "running",
        outputFile: live.outputFile,
        isActive: live.isActive,
      });
    }
    // Otherwise the job left nothing to act on: its terminal is gone and no
    // completion notification survived. Listing it would only offer a dead row.
  }

  // A notification can outlive the `executeCommand` part that started it,
  // because compaction rewrites older messages.
  const orphaned: JobListEntry[] = [];
  for (const notification of finished.values()) {
    if (commands.has(notification.backgroundJobId)) continue;
    orphaned.push({
      backgroundJobId: notification.backgroundJobId,
      title: notification.command ?? notification.backgroundJobId,
      command: notification.command,
      status: notification.status,
      outputFile: notification.outputFile,
      isActive: false,
    });
  }

  // Newest command first: the one just started is the one being watched. The
  // `%N` labels keep counting from the start of the task, so the numbering
  // still matches the badges in the message list. Jobs whose message was
  // compacted away are the oldest, so they stay at the bottom.
  return { pochi: [...pochi.reverse(), ...orphaned] };
}
