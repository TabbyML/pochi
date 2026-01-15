export interface VSCodeSettings {
  hideRecommendSettings: boolean;
  pochiLayout?:
    | {
        enabled?: boolean | undefined;
      }
    | undefined;
  autoSaveDisabled: boolean;
  commentsOpenViewDisabled: boolean;
  githubCopilotCodeCompletionEnabled: boolean;
}
