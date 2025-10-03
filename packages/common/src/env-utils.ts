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
