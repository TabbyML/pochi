export interface SessionState {
  lastVisitedRoute?: string | undefined;
  input?: string | undefined;
}

export interface WorkspaceState {
  chatInputSubmitHistory?: string[];
}
