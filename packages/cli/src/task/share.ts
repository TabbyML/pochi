import type { Command } from "@commander-js/extra-typings";
import { type Message, catalog } from "@getpochi/livekit";
import chalk from "chalk";
import { createApiClient } from "../lib/api-client";
import { createStore } from "../livekit/store";

export function registerTaskShareCommand(taskCommand: Command) {
  // pochi task share <id> - Create share link for a task ID
  taskCommand
    .command("share")
    .description("Create share link for a task ID")
    .argument("<task-id>", "Task ID to create share link for")
    .action(async (taskId) => {
      try {
        const store = await createStore(process.cwd());

        console.log(chalk.gray("Creating share link..."));

        const shareId = await createShareLink(taskId, store);

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

        await store.shutdown();
      } catch (error) {
        return taskCommand.error(
          `Failed to create share link: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    });
}

async function createShareLink(
  taskId: string,
  store: Awaited<ReturnType<typeof createStore>>,
): Promise<string | null> {
  try {
    // First check if shareId already exists locally
    const taskData = store.query(catalog.queries.makeTaskQuery(taskId));

    if (taskData?.shareId) {
      console.log(chalk.gray("Share link already exists locally."));
      return taskData.shareId;
    }

    // If no local shareId, create one via API
    const apiClient = await createApiClient();

    if (!apiClient.authenticated) {
      return null;
    }

    // Get existing messages for this task (if any)
    const messagesData = store.query(catalog.queries.makeMessagesQuery(taskId));

    // Extract Message data with proper types, default to empty array if no messages
    const messages: Message[] =
      messagesData.length > 0 ? messagesData.map((x) => x.data as Message) : [];

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

    return shareId;
  } catch (error) {
    console.error("Error creating share link:", error);
    return null;
  }
}
