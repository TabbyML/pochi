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
  /**
   * JSON string representing an array of messages to init the task.
   */
  initMessages?: string;
  /**
   * Disable auto start for the task
   */
  disablePendingModelAutoStart?: boolean;
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

export type ChangedFileContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "checkpoint";
      commit: string;
    };

export interface TaskChangedFile {
  filepath: string;
  added: number;
  removed: number;
  // if the content is null, it means the file was created
  content: ChangedFileContent | null;
  deleted?: boolean;
  state: "accepted" | "reverted" | "pending" | "userEdited";
}

export interface TaskState {
  unread?: boolean;
  active?: boolean;
  running?: boolean;
}

export type TaskStates = Record<string, TaskState>;
