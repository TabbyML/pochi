import type { Command } from "@commander-js/extra-typings";
import chalk from "chalk";
import omelette from "omelette";
import { createCompletionTreeFromProgram } from "./tree";

export function registerCompletionCommand(program: Command) {
  program
    .command("completion")
    .description("Generate shell completion script for pochi CLI.")
    .option(
      "--shell <shell>",
      "Target shell (bash, zsh, fish). Defaults to current shell.",
    )
    .action(async (options) => {
      const shell =
        options.shell || process.env.SHELL?.split("/").pop() || "bash";

      console.log(chalk.bold("🔧 Pochi CLI Auto-completion Setup"));
      console.log();

      // Generate the completion script
      try {
        const completion = omelette("pochi");
        // Get the root program by checking if parent exists
        const rootProgram =
          "parent" in program && program.parent ? program.parent : program;
        completion.tree(createCompletionTreeFromProgram(rootProgram));
        console.log(
          chalk.green("✅ Completion script generated successfully!"),
        );
        console.log();

        console.log(chalk.bold("📋 Setup Instructions:"));
        console.log();

        if (shell === "zsh") {
          console.log(chalk.cyan("For Zsh:"));
          console.log("1. Add the completion script to your shell:");
          console.log(chalk.yellow("   source <(pochi --completion)"));
          console.log();
          console.log();
          console.log("2. Add your ~/.zshrc file to make them permanent:");
          console.log(
            chalk.yellow("   echo 'source <(pochi --completion)' >> ~/.zshrc"),
          );
        } else {
          console.log(chalk.cyan("For Bash:"));
          console.log("1. Add the completion script to your shell:");
          console.log(chalk.yellow("   source <(pochi --completion)"));
          console.log();
          console.log("2. Add to your ~/.bashrc file to make it permanent:");
          console.log(
            chalk.yellow("   echo 'source <(pochi --completion)' >> ~/.bashrc"),
          );
        }

        console.log();
        console.log(
          chalk.green(
            "🎉 After setup, you can use Tab completion with pochi commands!",
          ),
        );
      } catch (error) {
        console.error(chalk.red("❌ Failed to generate completion script:"));
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
