import type { CommandUnknownOpts } from "@commander-js/extra-typings";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import { install, uninstall } from "tabtab";

export function registerCompletionCommand(program: CommandUnknownOpts) {
  const completionCommand = new Command("completion")
    .description("Manage shell completion for pochi CLI")
    .addCommand(
      new Command("install")
        .description("Install shell completion for the current shell")
        .action(async () => {
          try {
            await install({
              name: "pochi",
              completer: "pochi",
            });
            console.log(
              chalk.green("✓ Shell completion installed successfully!"),
            );
          } catch (error) {
            console.error(
              chalk.red("✗ Failed to install shell completion:"),
              error,
            );
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("uninstall")
        .description("Uninstall shell completion")
        .action(async () => {
          try {
            await uninstall({
              name: "pochi",
            });
            console.log(
              chalk.green("✓ Shell completion uninstalled successfully!"),
            );
          } catch (error) {
            console.error(
              chalk.red("✗ Failed to uninstall shell completion:"),
              error,
            );
            process.exit(1);
          }
        }),
    );

  program.addCommand(completionCommand);
}
