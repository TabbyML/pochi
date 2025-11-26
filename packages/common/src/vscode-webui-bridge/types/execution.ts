// Type for user edits with diff information
export type FileDiff = {
  filepath: string;
  diff: string;
  added: number;
  removed: number;
  created?: boolean;
  deleted?: boolean;
};

export type ExecuteCommandResult = {
  content: string;
  status: "idle" | "running" | "completed";
  isTruncated: boolean;
  error?: string; // Optional error message if the execution aborted / failed
};

export type SaveCheckpointOptions = {
  /**
   * By default, will only save checkpoint if there are changes, but if you want to force a save, set this to true
   */
  force?: boolean;
};
