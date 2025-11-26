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

// if the content is null, it means the file was created
export type ChangedFileContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "checkpoint";
      commit: string;
    }
  | null;

export interface TaskChangedFile {
  filepath: string;
  added: number;
  removed: number;
  content: ChangedFileContent;
  deleted?: boolean;
  state: "accepted" | "reverted" | "pending" | "userEdited";
}
