/**
 * Bare shell process names as produced by the default
 * `terminal.integrated.tabs.title` (`${process}`) when the shell is idle.
 * These carry no information about what the terminal is used for.
 */
const PlainShellNameRegex =
  /^(zsh|bash|sh|dash|fish|ksh|tcsh|csh|nu|nushell|pwsh|powershell|cmd)(\.exe)?$/i;

/**
 * Formats a user terminal's display name. A bare shell name ("zsh", "bash",
 * …) is disambiguated by appending the last command run in the terminal;
 * any other name (task terminals, renamed tabs, OSC titles) is informative
 * on its own and shown as-is.
 */
export function formatTerminalDisplayName(
  name: string | undefined,
  lastCommand: string | undefined,
): string | undefined {
  if (!name) return lastCommand;
  if (lastCommand && PlainShellNameRegex.test(name.trim())) {
    return `${name} · ${lastCommand}`;
  }
  return name;
}
