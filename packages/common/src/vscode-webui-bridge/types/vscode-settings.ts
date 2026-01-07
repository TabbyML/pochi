export interface VSCodeSettings {
  recommendSettingsConfirmed: boolean;
  pochiLayout?:
    | {
        enabled?: boolean | undefined;
      }
    | undefined;
  autoSaveDisabled: boolean;
  commentsOpenViewDisabled: boolean;
  githubCopilotCodeCompletionEnabled: boolean;
}
