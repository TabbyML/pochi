import type { Command } from "@commander-js/extra-typings";
import { type Task, catalog } from "@getpochi/livekit";
import select from "@inquirer/select";
import chalk from "chalk";
import { createStore } from "../livekit/store";
import { safeShutdownStore } from "../shutdown";

export function registerTaskListCommand(taskCommand: Command) {
  // pochi task list - List recent tasks
  taskCommand
    .command("list", { isDefault: true })
    .description("List all recent tasks, showing their status and IDs.")
    .option(
      "-n, --limit <number>",
      "The maximum number of tasks to display.",
      "100",
    )
    .action(async (options) => {
      const limit = Number.parseInt(options.limit, 10);
      if (Number.isNaN(limit) || limit <= 0) {
        return taskCommand.error("Limit must be a positive number");
      }

      const store = await createStore(process.cwd());

      try {
        const allTasks = store.query(catalog.queries.tasks$);
        const sortedTasks = [...allTasks].sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
        );
        const tasks = sortedTasks.slice(0, limit);

        if (tasks.length === 0) {
          console.log(chalk.gray("No tasks found"));
          console.log();
          console.log(chalk.cyan("💡 Tip: To start a new task, use:"));
          console.log(chalk.white(`   pochi -p "<your task description>"`));
          return;
        }

        const taskId = await select({
          message: `Showing the last ${chalk.bold(limit)} tasks:`,
          choices: tasks.map((task) => ({
            name: formatTaskForSelect(task),
            short: task.id,
            value: task.id,
            description: formatTaskDescription(task),
            disabled: !task.shareId,
          })),
          pageSize: 10,
          theme: {
            style: {
              description: (text: string) => text,
            },
            helpMode: "never",
            indexMode: "number",
          },
        });

        const task = tasks.find((t) => t.id === taskId);
        if (task) {
          console.log(
            `\n${formatTaskForSelect(task)}\n${formatTaskDescription(task, false)}`,
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("SIGINT")) {
          // ignore ctrl-c
        } else {
          return taskCommand.error(
            `Failed to list tasks: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      } finally {
        await safeShutdownStore(store);
      }
    });
}

function formatTaskForSelect(task: Task): string {
  const statusColor = getStatusColor(task.status);
  const title = clipTitle(task.title || task.id.substring(0, 8), 75);
  return `${statusColor(getStatusIcon(task.status))} ${chalk.bold(title)}`;
}

function formatTaskDescription(task: Task, includeID = true): string {
  const timeAgo = getTimeAgo(task.updatedAt);
  let description = "";
  if (includeID) {
    description += `\n  ID: ${chalk.cyan(task.id)}`;
  }
  description += `\n  Last Updated: ${chalk.gray(timeAgo)}`;
  if (task.shareId) {
    description += `\n  Share URL: ${chalk.underline(`https://app.getpochi.com/share/${task.shareId}`)}`;
  }
  return description;
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

function clipTitle(title: string, maxLength: number): string {
  if (title.length <= maxLength) return title;
  return `${title.substring(0, maxLength - 3)}...`;
}
