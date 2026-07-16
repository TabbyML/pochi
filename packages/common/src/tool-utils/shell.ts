export const getShellPath = () => {
  if (process.platform === "win32") {
    const defaultShell = process.env.ComSpec;
    if (defaultShell) {
      return defaultShell;
    }
    return "powershell.exe";
  }
  if (process.platform === "linux" || process.platform === "darwin") {
    const defaultShell = process.env.SHELL;
    if (defaultShell && /(bash|zsh)$/.test(defaultShell)) {
      return defaultShell;
    }
    return "/bin/bash";
  }
  return undefined;
};

export const buildShellCommand = (
  commandString: string,
):
  | {
      command: string;
      args: string[];
    }
  | undefined => {
  const shellPath = getShellPath();
  const isFlatpak =
    process.platform === "linux" &&
    Boolean(process.env.FLATPAK_ID || process.env.FLATPAK_SANDBOX_DIR);
  const loginArg = isFlatpak ? "-lc" : "-c";

  if (shellPath) {
    // Determine shell type and appropriate arguments using RegExp for precise matching
    const shellName = shellPath.toLowerCase();
    if (/powershell(\.exe)?$|pwsh(\.exe)?$/.test(shellName)) {
      // Force UTF-8 output so non-ASCII text (e.g. localized error messages)
      // is not mangled by the console's OEM codepage (e.g. GBK/CP936 on
      // Chinese Windows). Use a BOM-less UTF8Encoding to avoid emitting a BOM.
      return {
        command: shellPath,
        args: [
          "-Command",
          `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);${commandString}`,
        ],
      };
    }

    if (/cmd(\.exe)?$/.test(shellName)) {
      // Switch the console codepage to UTF-8 (65001) before running the
      // command so non-ASCII output is emitted as UTF-8 instead of the OEM
      // codepage (e.g. GBK/CP936 on Chinese Windows).
      return {
        command: shellPath,
        args: ["/d", "/s", "/c", `chcp 65001>nul & ${commandString}`],
      };
    }

    if (/(bash|zsh)$/.test(shellName)) {
      const shellCommand = {
        command: shellPath,
        args: [loginArg, commandString],
      };

      if (isFlatpak) {
        return {
          command: "/usr/bin/flatpak-spawn",
          args: ["--host", shellCommand.command, ...shellCommand.args],
        };
      }

      return shellCommand;
    }
  }

  return undefined;
};

export const fixExecuteCommandOutput = (output: string): string => {
  // Ensure CRLF ('\r\n') as line separator, '\n' only moves the cursor one line down but not to the beginning
  return output.replace(/(?<!\r)\n/g, "\r\n");
};
