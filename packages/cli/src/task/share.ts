import type { Command } from "@commander-js/extra-typings";
import { catalog } from "@getpochi/livekit";
import chalk from "chalk";
import { createStore } from "../livekit/store";
import { safeShutdownStore } from "../shutdown";

export function registerTaskShareCommand(taskCommand: Command) {
  // pochi task get-share-url <id> - Get share URL for a task ID
  taskCommand
    .command("get-share-url")
    .description("Get the shareable URL for a specific task by its ID.")
    .argument("<task-id>", "The ID of the task to get the share URL for.")
    .action(async (taskId) => {
      const store = await createStore(process.cwd());

      const { shareId } =
        store.query(catalog.queries.makeTaskQuery(taskId)) || {};

      if (shareId) {
        const shareUrl = `https://app.getpochi.com/share/${shareId}`;
        console.log(
          `${chalk.bold("📎 Share URL:")} ${chalk.underline(shareUrl)}`,
        );
      } else {
        console.log(chalk.red("❌ No share URL found for this task"));
      }

      await safeShutdownStore(store);
    });
}
