export interface VSCodeSettings {
  recommendSettingsConfirmed: boolean;
  pochiLayout?:
    | {
        keybindingEnabled?: boolean | undefined;
        moveBottomPanelViews?: boolean | undefined;
      }
    | undefined;
  autoSaveDisabled: boolean;
  commentsOpenViewDisabled: boolean;
  githubCopilotCodeCompletionEnabled: boolean;
}
