import * as os from "node:os";
import * as vscode from "vscode";

export function isTerminalLikelyCreatedByDefault(
  terminal: vscode.Terminal,
): boolean {
  // Determine if the terminal was created by default when the terminal panel appears
  // We have no api to detect it, checking the creationOptions is the best effort

  const creationOptions = terminal.creationOptions;

  // If it's a PseudoTerminal or ExtensionTerminal, it's not a default terminal
  if ("pty" in creationOptions) {
    return false;
  }

  const termOptions = creationOptions as vscode.TerminalOptions;
  if (termOptions.location) {
    return false;
  }
  if (termOptions.message) {
    return false;
  }

  const config = vscode.workspace.getConfiguration("terminal.integrated");
  const osPlatform = os.platform();
  const platform =
    osPlatform === "win32"
      ? "windows"
      : osPlatform === "darwin"
        ? "osx"
        : "linux";

  const defaultProfileName = config.get<string>(`defaultProfile.${platform}`);
  if (!defaultProfileName) {
    return (
      termOptions.name === undefined &&
      termOptions.shellPath === undefined &&
      termOptions.shellArgs === undefined &&
      termOptions.cwd === undefined
    );
  }

  const profiles = config.get<{ [key: string]: object }>(
    `profiles.${platform}`,
    {},
  );
  if (defaultProfileName in profiles) {
    const profile = profiles[defaultProfileName];
    if (!profile) {
      return false;
    }
    const name =
      "overrideName" in profile && profile.overrideName
        ? defaultProfileName
        : undefined;
    return termOptions.name === name && termOptions.cwd === undefined;
  }

  if (getContributedTerminalProfiles().includes(defaultProfileName)) {
    return termOptions.name === defaultProfileName;
  }

  return termOptions.name === undefined && termOptions.cwd === undefined;
}

function getContributedTerminalProfiles() {
  const contributedProfiles: string[] = [];

  const extensions = vscode.extensions.all;
  for (const extension of extensions) {
    const packageJSON = extension.packageJSON;
    if (!packageJSON?.contributes?.terminal?.profiles) {
      continue;
    }
    const profiles = packageJSON.contributes.terminal.profiles;
    if (!Array.isArray(profiles)) {
      continue;
    }
    for (const profile of profiles) {
      if (profile.title) {
        contributedProfiles.push(profile.title);
      }
    }
  }
  return contributedProfiles;
}
