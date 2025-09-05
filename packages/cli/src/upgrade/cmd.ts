import type { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import packageJson from "../../package.json";
import { downloadAndInstall } from "./binary-installer";
import { fetchLatestCliRelease } from "./release-fetcher";
import { extractVersionFromTag, isNewerVersion } from "./version-utils";

export function registerUpgradeCommand(program: Command) {
  program
    .command("upgrade")
    .description("Upgrade CLI")
    .action(async () => {
      console.log("Checking for updates...");

      try {
        const latestRelease = await fetchLatestCliRelease();
        const latestVersion = extractVersionFromTag(latestRelease.tag_name);
        const currentVersion = packageJson.version;

        console.log(`Current version: ${currentVersion}`);
        console.log(`Latest version: ${latestVersion}`);

        if (isNewerVersion(latestVersion, currentVersion)) {
          console.log(
            chalk.green(`A new version (${latestVersion}) is available!`),
          );
          await downloadAndInstall(latestRelease);
        } else {
          console.log(chalk.green("You are already on the latest version."));
        }
      } catch (error) {
        return program.error(
          `Failed to check for updates: ${JSON.stringify(error)}`,
        );
      }
    });
}
