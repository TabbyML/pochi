import type { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { downloadAndInstall } from "./binary-installer";
import { returnVersionInfo } from "./version-check";

export function registerUpgradeCommand(program: Command) {
  program
    .command("upgrade")
    .description(
      "Check for new releases and upgrade the Pochi CLI to the latest version.",
    )
    .action(async () => {
      console.log("Checking for updates...");

      try {
        const {
          updateAvailable,
          latestVersion,
          latestRelease,
          currentVersion,
        } = await returnVersionInfo({ timeoutMs: null });
        console.log(`Current version: ${currentVersion}`);

        if (updateAvailable) {
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
