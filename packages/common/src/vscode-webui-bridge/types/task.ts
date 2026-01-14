export type FileUIPart = {
  name: string;
  contentType: string;
  url: string;
};

/**
 * Per-task MCP tool configuration.
 * Key = server name, presence indicates server is enabled for this task.
 */
export type TaskMcpTools = {
  [serverName: string]: {
    disabledTools: readonly string[];
  };
};

export type PochiTaskParams = { cwd: string } & (
  | {
      type: "new-task";
      uid?: string;
      prompt?: string;
      files?: FileUIPart[];
      mcpTools?: TaskMcpTools;
    }
  | {
      type: "fork-task";
      messages: string;
      title: string;
      mcpTools?: TaskMcpTools;
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

export type PochiTaskInfo = PochiTaskParams & {
  uid: string;
  displayId: number | null;
};

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

  cwd: string;
  lastCheckpointHash?: string;
  focused?: boolean;
}

export type TaskStates = Record<string, TaskState>;
