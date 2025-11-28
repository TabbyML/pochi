export interface GitWorktree {
  path: string;
  branch?: string;
  commit: string;
  isMain: boolean;
  prunable?: string;
}

export interface DiffCheckpointOptions {
  maxSizeLimit?: number;
  inlineDiff?: boolean;
}
