export type FileUIPart = {
  name: string;
  contentType: string;
  url: string;
};

export type PochiEditorParams = { cwd: string } & (
  | {
      type: "new-task";
      uid?: string;
      prompt?: string;
      files?: FileUIPart[];
    }
  | {
      type: "fork-task";
      messages: string;
      title: string;
    }
  | {
      type: "compact-task";
      messages: string;
    }
  | {
      type: "open-task";
      uid: string;
      displayId: number | null;
      storeId?: string;
    }
);

export type PochiEditorInfo = {
  uid: string;
  displayId: number | null;
  cwd: string;
  params: PochiEditorParams;
};

// export interface TaskIdParams {
//   uid: string;
//   storeId?: string;

//   // for open task from website
//   prompt?: string;
//   files?: FileUIPart[];
//   /**
//    * JSON string representing an array of messages to init the task.
//    */
//   initMessages?: string;

//   initTitle?: string;

//   /**
//    * Disable auto start for the task
//    */
//   disablePendingModelAutoStart?: boolean;
// }

// export interface TaskPanelParams extends TaskIdParams {
//   cwd: string;
//   displayId?: number;
// }

// export interface NewTaskParams {
//   prompt?: string;
//   files?: FileUIPart[];
// }

// export interface NewTaskPanelParams extends NewTaskParams {
//   cwd: string;
// }

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
