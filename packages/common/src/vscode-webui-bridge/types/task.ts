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

export interface TaskPanelParams extends TaskIdParams {
  cwd: string;
}

export interface NewTaskParams {
  uid?: undefined;
}

export interface NewTaskPanelParams extends NewTaskParams {
  cwd: string;
}

export interface TaskUriQueryParams {
  cwd: string;
  uid: string;
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
