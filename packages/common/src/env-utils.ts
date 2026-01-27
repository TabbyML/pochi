export const getTerminalEnv = () => ({
  PAGER: "cat",
  GIT_COMMITTER_NAME: "Pochi",
  GIT_COMMITTER_EMAIL: "noreply@getpochi.com",
  GIT_EDITOR: "true",
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
