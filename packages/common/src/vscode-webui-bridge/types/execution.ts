export type ExecuteCommandResult = {
  content: string;
  status: "idle" | "running" | "completed";
  isTruncated: boolean;
  error?: string; // Optional error message if the execution aborted / failed
  _meta?: {
    backgroundJobId: string;
    outputFile?: string;
  };
};
