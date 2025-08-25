import { execSync } from "node:child_process";
import * as fs from "node:fs";

/**
 * Synchronously check if a command exists in the system PATH
 * @param command - The command to check
 * @returns True if command exists, false otherwise
 */
function commandExistsSync(command: string): boolean {
  const isWindows = process.platform === "win32";
  const checkCommand = isWindows ? "where" : "which";

  try {
    execSync(`${checkCommand} ${command}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the full path to a command in the system PATH
 * @param command - The command to find
 * @returns The full path to the command or null if not found
 */
function getCommandPath(command: string): string | null {
  const isWindows = process.platform === "win32";
  const checkCommand = isWindows ? "where" : "which";

  try {
    const result = execSync(`${checkCommand} ${command}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return result.trim().split("\n")[0]; // Return first match
  } catch {
    return null;
  }
}

/**
 * Find ripgrep executable in system PATH or common installation locations
 * @returns The path to ripgrep executable or null if not found
 */
export function findRipgrep(): string | null {
  // First try to find 'rg' in PATH
  if (commandExistsSync("rg")) {
    const rgPath = getCommandPath("rg");
    if (rgPath && fs.existsSync(rgPath)) {
      return rgPath;
    }
  }

  // Common installation paths to check as fallback
  const commonPaths = [
    "/usr/local/bin/rg",
    "/opt/homebrew/bin/rg",
    "/usr/bin/rg",
    "/bin/rg",
    // Windows paths
    "C:\\Program Files\\ripgrep\\rg.exe",
    "C:\\Tools\\ripgrep\\rg.exe",
  ];

  for (const path of commonPaths) {
    if (fs.existsSync(path)) {
      return path;
    }
  }

  return null;
}
