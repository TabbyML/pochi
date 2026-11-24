export type JobStatus = "running" | "completed" | "failed" | "stopped";

export type BackgroundJobEntry = {
  backgroundJobId: string;
  notificationPending?: boolean;
  title: string;
  status: JobStatus;
} & (
  | {
      kind: "command";
      command?: string;
      /** Short user-facing title the model gave a background command. */
      description?: string;
      monitor?: string;
      exitCode?: number;
      outputFile?: string;
    }
  | {
      kind: "subagent";
      taskId: string;
      agentType?: string;
      /** Running, but still waiting for a free execution slot. */
      queued?: boolean;
    }
  | {
      kind: "fork";
      taskId: string;
      /** When the agent's task was created, in epoch milliseconds. */
      createdAt?: number;
      /** Running, but still waiting for a free execution slot. */
      queued?: boolean;
    }
);
