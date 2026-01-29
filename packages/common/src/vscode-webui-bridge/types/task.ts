import type { ActiveSelection } from "./message";

export type FileUIPart = {
  name: string;
  contentType: string;
  url: string;
};

/**
 * Per-task MCP configuration override.
 * Key = server name, presence indicates server is enabled for this task.
 */
export type McpConfigOverride = {
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
      activeSelection?: ActiveSelection;
      mcpConfigOverride?: McpConfigOverride;
    }
  | {
      type: "fork-task";
      uid: string;
      storeId: string;
      mcpConfigOverride?: McpConfigOverride;
    }
  | {
      type: "compact-task";
      messages: string;
    }
  | {
      type: "open-task";
      uid: string;
      storeId?: string;
    }
);

export type PochiTaskInfo = PochiTaskParams & {
  uid: string;
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
  requiresApproval?: boolean;

  cwd: string;
  lastCheckpointHash?: string;
  focused?: boolean;
}

export type TaskStates = Record<string, TaskState>;

export type TaskArchivedParams =
  | { type: "single"; taskId: string; archived: boolean }
  | { type: "batch"; cwd?: string };

/**
 * Get the global state key for the changed file store of a task.
 * This is used by both the webview (zustand persist) and vscode extension (cleanup).
 */
export function getChangedFileStoreKey(taskId: string): string {
  return `changed-file-store-${taskId}`;
}
