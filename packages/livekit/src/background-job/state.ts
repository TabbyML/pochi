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
      exitCode?: number;
      outputFile?: string;
    }
  | {
      kind: "subagent";
      taskId: string;
      agentType?: string;
    }
  | {
      kind: "fork";
      taskId: string;
    }
);
