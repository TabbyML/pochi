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

export interface TaskDataParams {
  uid: string;
  task: TaskData;
}

export interface TaskData {
  id: string;
  shareId?: string | null;
  cwd: string | null;
  isPublicShared: boolean;
  title: string | null;
  parentId: string | null;
  status:
    | "completed"
    | "pending-input"
    | "failed"
    | "pending-tool"
    | "pending-model";
  todos?: readonly {
    readonly id: string;
    readonly status: "pending" | "in-progress" | "completed" | "cancelled";
    readonly content: string;
    readonly priority: "low" | "medium" | "high";
  }[];
  git: {
    readonly origin?: string | undefined;
    readonly branch: string;
    readonly worktree: string;
  } | null;
  gitRoot: string | null;
  totalTokens: number | null;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  error?: any;
  createdAt: string;
  updatedAt: string;
  messages: readonly {
    readonly id: string;
    readonly role: "user" | "assistant" | "system";
    readonly parts: readonly unknown[];
  }[];
}
