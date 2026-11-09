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
      /** Running, but still waiting for a free execution slot. */
      queued?: boolean;
    }
);
