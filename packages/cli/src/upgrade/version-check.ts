import packageJson from "../../package.json";
import { fetchLatestCliRelease } from "./release-fetcher";
import type { GitHubRelease } from "./release-fetcher";
import { extractVersionFromTag, isNewerVersion } from "./version-utils";
import chalk from "chalk";


export interface VersionCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  latestRelease: GitHubRelease;
}

export async function returnVersionInfo(): Promise<VersionCheckResult> {
  const latestRelease = await fetchLatestCliRelease();
  const latestVersion = extractVersionFromTag(latestRelease.tag_name);
  const currentVersion = packageJson.version;

  return {
    updateAvailable: isNewerVersion(latestVersion, currentVersion),
    currentVersion,
    latestVersion,
    latestRelease,
  };
}


export async function checkForUpdates() {
  const { updateAvailable, currentVersion, latestVersion } = await returnVersionInfo();

  const header = `${chalk.bold("Pochi")} ${chalk.white(currentVersion)}`;

  const line = updateAvailable
    ? `${header} ${chalk.dim("(update available")} ${chalk.green(latestVersion)}${chalk.dim(")")}`
    : header;

  console.log(line);
    
  const columns = process.stdout.columns || 80;
  const width = Math.max(Math.min(columns, 100), 20);
  console.log(chalk.yellow("─".repeat(width)));
}