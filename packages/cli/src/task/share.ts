import type { Command } from "@commander-js/extra-typings";
import { catalog, type Message } from "@getpochi/livekit";
import chalk from "chalk";
import { createApiClient } from "../lib/api-client";
import { createStore } from "../livekit/store";
import { events } from "../../../livekit/src/livestore/schema";

export function registerTaskShareCommand(taskCommand: Command) {
  // pochi task share <id> - Create share link for a task
  taskCommand
    .command("share")
    .description("Create or get share link for a task")
    .argument("<task-id>", "Task ID or prefix to share")
    .action(async (taskIdInput) => {
      try {
        const store = await createStore(process.cwd());

        // First try exact match
        let task = store.query(catalog.queries.makeTaskQuery(taskIdInput));
        
        if (!task) {
          // If no exact match, try prefix matching
          const allTasks = store.query(catalog.queries.tasks$);
          const prefixMatches = allTasks.filter((t) =>
            t.id.startsWith(taskIdInput),
          );

          if (prefixMatches.length === 0) {
            return taskCommand.error(`Task ${taskIdInput} not found`);
          } 
          
          if (prefixMatches.length === 1) {
            task = prefixMatches[0];
          } else {
            // Multiple matches - show options
            console.log(
              chalk.yellow(`⚠️  Multiple tasks match prefix "${taskIdInput}":`),
            );
            console.log();

            for (const matchedTask of prefixMatches.slice(0, 10)) {
              // Show max 10 matches
              const title = matchedTask.title || matchedTask.id.substring(0, 8);
              const timeAgo = getTimeAgo(matchedTask.updatedAt);
              const statusIcon = getStatusIcon(matchedTask.status);

              console.log(
                `  ${statusIcon} ${chalk.bold(title)} ${chalk.gray(`(${timeAgo})`)}}`,
              );
              console.log(chalk.gray(`     ID: ${matchedTask.id}`));
            }

            if (prefixMatches.length > 10) {
              console.log(
                chalk.gray(`     ... and ${prefixMatches.length - 10} more`),
              );
            }

            console.log();
            console.log(
              chalk.blue(
                "Please provide a more specific ID prefix or the full ID.",
              ),
            );
            await store.shutdown();
            return;
          }
        }

        if (task.shareId) {
          const shareUrl = `https://app.getpochi.com/share/${task.shareId}`;
          console.log(
            `${chalk.bold("📎 Share link:")} ${chalk.underline(shareUrl)}`,
          );
        } else {
          // Task exists but no share link, create one
          console.log(chalk.gray("Creating share link..."));

          try {
            const shareId = await createShareLink(task.id, store);

            if (shareId) {
              const shareUrl = `https://app.getpochi.com/share/${shareId}`;
              console.log(
                `${chalk.bold("📎 Share link:")} ${chalk.underline(shareUrl)}`,
              );
            } else {
              console.log(
                chalk.red(
                  "❌ Failed to create share link (possibly not logged in)",
                ),
              );
            }
          } catch (error) {
            console.log(
              chalk.red(
                `❌ Failed to create share link: ${error instanceof Error ? error.message : "Unknown error"}`,
              ),
            );
          }
        }

        await store.shutdown();
      } catch (error) {
        return taskCommand.error(
          `Failed to get share link: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    });
}

async function createShareLink(
  taskId: string,
  store: Awaited<ReturnType<typeof createStore>>,
): Promise<string | null> {
  try {
    const apiClient = await createApiClient();
    
    if (!apiClient.authenticated) {
      return null;
    }

    // Get existing messages for this task to send to server
    const messagesData = store.query(catalog.queries.makeMessagesQuery(taskId));
    
    // Extract Message data with proper types
    const messages: Message[] = messagesData.map((x) => x.data as Message);

    const { formatters } = await import("@getpochi/common");

    const resp = await apiClient.api.chat.persist.$post({
      json: {
        id: taskId,
        messages: formatters.storage(messages),
        status: "pending-input",
      },
    });

    if (resp.status !== 200) {
      return null;
    }

    const { shareId } = await resp.json();

    if (shareId) {
      // Update the local store with the new shareId
      store.commit(
        events.updateShareId({
          id: taskId,
          shareId,
          updatedAt: new Date(),
        }),
      );
    }

    return shareId;
  } catch (error) {
    console.error("Error creating share link:", error);
    return null;
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