import chalk from "chalk";
import packageJson from "../../package.json";
import { fetchLatestCliRelease } from "./release-fetcher";
import type { GitHubRelease } from "./release-fetcher";
import { extractVersionFromTag, isNewerVersion } from "./version-utils";

export interface VersionCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  latestRelease: GitHubRelease;
}

export async function returnVersionInfo(options?: {
  timeoutMs?: number | null;
}): Promise<VersionCheckResult> {
  const { timeoutMs } = options ?? {}; //Optional timeout, used for version check

  const latestReleasePromise = fetchLatestCliRelease();

  // If timeout is provided, use it else wait for the release to be fetched
  const latestRelease = (await (timeoutMs != null
    ? Promise.race<GitHubRelease | never>([
        latestReleasePromise,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("version check timeout")),
            timeoutMs,
          ),
        ),
      ])
    : latestReleasePromise)) as GitHubRelease;

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
  const { updateAvailable, currentVersion, latestVersion } =
    await returnVersionInfo({ timeoutMs: 300 });

  const header = `\n${chalk.bold("Pochi")} ${chalk.white(currentVersion)}`;

  // If update is available, show the latest version beside the current version in parentheses, else show the current version
  const line = updateAvailable
    ? `${header} ${chalk.dim("(update available")} ${chalk.green(latestVersion)}${chalk.dim(")")}`
    : header;

  console.log(line);

  const columns = process.stdout.columns || 80;
  const width = Math.max(Math.min(columns, 100), 20);
  console.log(chalk.yellow("─".repeat(width)));
}
