export interface VSCodeSettings {
  recommendSettingsConfirmed: boolean;
  pochiLayout?:
    | {
        moveBottomPanelViews?: boolean | undefined;
      }
    | undefined;
  autoSaveDisabled: boolean;
  commentsOpenViewDisabled: boolean;
  githubCopilotCodeCompletionEnabled: boolean;
}
