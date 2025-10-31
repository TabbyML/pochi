export type FileUIPart = {
  name: string;
  contentType: string;
  url: string;
};

export interface TaskIdParams {
  uid: string;
  storeId?: string;
  prompt?: string;
  files?: FileUIPart[];
}

export interface NewTaskParams {
  uid?: undefined;
}

/**
 * only include fields that are used in the webview and node process
 */
export interface TaskData {
  id: string;
  cwd?: string | null;
  git?: {
    worktree?: { gitdir?: string } | null;
  } | null;
}
