export type FileUIPart = {
  name: string;
  contentType: string;
  url: string;
};

export interface TaskIdParams {
  uid: string;
  prompt?: string;
  files?: FileUIPart[];
}

export interface NewTaskParams {
  uid: undefined;
}

export interface TaskDataParams<T extends TaskData = TaskData> {
  uid: string;
  /**
   * @link packages/vscode-webui/src/livestore-provider.tsx#TaskSyncData
   */
  task: T;
}

export interface TaskData {
  id: string;
  cwd?: string;
}
