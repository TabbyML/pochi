export const getTerminalEnv = () => ({
  PAGER: "cat",
  GIT_COMMITTER_NAME: "Pochi",
  GIT_COMMITTER_EMAIL: "noreply@getpochi.com",
  GIT_EDITOR: "true",
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "never",
  // Prevent zsh from drawing its inverse-video `%` marker into captured PTY
  // output when a command does not end with a newline.
  PROMPT_EOL_MARK: "",
});

export const isVSCodeEnvironment = () => {
  if (typeof process !== "undefined") {
    if (process.env.VSCODE_PID) {
      return true;
    }

    if (process.env.VSCODE_SERVER_PORT) {
      return true;
    }

    if (process.env.VSCODE_CWD) {
      return true;
    }
  }

  return false;
};
