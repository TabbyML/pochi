export interface SessionState {
  lastVisitedRoute?: string | undefined;
  input?: string | undefined;
}

export type BackgroundTaskEntry = {
  uid: string;
  cwd: string;
  parentId?: string;
  createdAt: number;
};

export interface WorkspaceState {
  chatInputSubmitHistory?: string[];
  backgroundTasks?: BackgroundTaskEntry[];
}
