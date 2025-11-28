export interface GitWorktree {
  path: string;
  branch?: string;
  commit: string;
  isMain: boolean;
  prunable?: string;
}

export interface DiffCheckpointOptions {
  /**
   * Maximum size limit (in bytes) for files to be included in the diff. Files exceeding this limit will be skipped.
   */
  maxSizeLimit?: number;
  /**
   * Whether to include inline user diffs for text files in the diff output. If set to true, the diff will show line-by-line changes within the files.
   */
  inlineDiff?: boolean;
}
