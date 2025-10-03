import os from "node:os";
import type { Environment } from "../base";

/**
 * Gets system information such as current working directory, shell, OS, and home directory.
 * @param cwd The current working directory to use. If not provided, uses process.cwd()
 * @returns An object containing system information such as cwd, shell, os, and homedir.
 */
export function getSystemInfo(cwd: string | null): Environment["info"] {
  const platform = process.platform;
  const homedir = os.homedir();
  const shell = process.env.SHELL || "";
  const currentWorkingDirectory = cwd || process.cwd();

  return {
    cwd: currentWorkingDirectory,
    shell,
    os: platform,
    homedir,
  };
}
