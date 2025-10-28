export interface GitWorktree {
  path: string;
  branch?: string;
  commit: string;
  isMain: boolean;
}
