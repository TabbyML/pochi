import type { Command } from "@commander-js/extra-typings";
import { catalog } from "@getpochi/livekit";
import chalk from "chalk";
import { createStore } from "../livekit/store";

export function registerTaskListCommand(taskCommand: Command) {
  // pochi task list - List recent tasks
  taskCommand
    .command("list", { isDefault: true })
    .description("List recent tasks")
    .option("-n, --limit <number>", "Number of tasks to show", "10")
    .action(async (options) => {
      const limit = Number.parseInt(options.limit, 10);
      if (Number.isNaN(limit) || limit <= 0) {
        return taskCommand.error("Limit must be a positive number");
      }

      try {
        const store = await createStore(process.cwd());

        // Query recent tasks ordered by updatedAt  
        // Use the existing tasks$ query which handles parentId IS NULL
        const allTasks = store.query(catalog.queries.tasks$);
        const tasks = allTasks.slice(0, limit);

        if (tasks.length === 0) {
          console.log(chalk.gray("No tasks found"));
          return;
        }

        console.log(chalk.bold(`\nRecent Tasks (${tasks.length}):`));
        console.log();

        for (const task of tasks) {
          const statusColor = getStatusColor(task.status);
          const title = task.title || task.id.substring(0, 8);
          const timeAgo = getTimeAgo(task.updatedAt);

          const shareInfo = task.shareId
            ? chalk.blue(` [${task.shareId.substring(0, 8)}]`)
            : "";

          console.log(
            `${statusColor(getStatusIcon(task.status))} ${chalk.bold(title)}${shareInfo} ${chalk.gray(`(${timeAgo})`)}`,
          );
          console.log(chalk.gray(`   ID: ${task.id}`));

          if (task.shareId) {
            console.log(
              chalk.gray(
                `   Share: https://app.getpochi.com/share/${task.shareId}`,
              ),
            );
          }
          console.log();
        }

        await store.shutdown();
      } catch (error) {
        return taskCommand.error(
          `Failed to list tasks: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    });
}

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return chalk.green;
    case "failed":
      return chalk.red;
    case "pending-input":
    case "pending-tool":
    case "pending-model":
      return chalk.yellow;
    default:
      return chalk.gray;
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "completed":
      return "✓";
    case "failed":
      return "✗";
    case "pending-input":
    case "pending-tool":
    case "pending-model":
      return "◐";
    default:
      return "○";
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}