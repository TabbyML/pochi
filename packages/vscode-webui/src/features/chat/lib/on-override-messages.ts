import { getTaskChangedFileStore } from "@/lib/hooks/use-task-changed-files";
import { vscodeHost } from "@/lib/vscode";
import { prompts } from "@getpochi/common";
import { extractWorkflowBashCommands } from "@getpochi/common/message-utils";
import { type Message, catalog } from "@getpochi/livekit";
import type { Store } from "@livestore/livestore";
import { ThreadAbortSignal } from "@quilted/threads";
import { unique } from "remeda";

/**
 * Handles the onOverrideMessages event by appending a checkpoint to the last message.
 * This ensures that each request has a checkpoint for potential rollbacks.
 */
export async function onOverrideMessages({
  store,
  taskId,
  messages,
  abortSignal,
}: {
  store: Store;
  taskId: string;
  messages: Message[];
  abortSignal: AbortSignal;
}) {
  const checkpoints = messages
    .flatMap((m) => m.parts.filter((p) => p.type === "data-checkpoint"))
    .map((p) => p.data.commit);
  const lastMessage = messages.at(-1);
  if (lastMessage) {
    const ckpt = await appendCheckpoint(lastMessage);
    await appendWorkflowBashOutputs(lastMessage, abortSignal);

    const firstCheckpoint = checkpoints.at(0);
    if (firstCheckpoint) {
      // side bar diff edits
      await updateTaskLineChanges(store, taskId, firstCheckpoint);
    }

    const lastCheckpoint = checkpoints.at(-1);
    if (ckpt && lastMessage.role === "assistant" && lastCheckpoint) {
      // diff summary in chat view
      await updateChangedFiles(taskId, lastCheckpoint, lastMessage);
    }
  }
}

/**
 * Appends a checkpoint to a message if one doesn't already exist in the current step.
 * A checkpoint is created to save the current state before making changes.
 */
async function appendCheckpoint(message: Message) {
  const lastStepStartIndex =
    message.parts.reduce((lastIndex, part, index) => {
      return part.type === "step-start" ? index : lastIndex;
    }, -1) ?? -1;

  if (
    message.parts
      .slice(lastStepStartIndex + 1)
      .some((x) => x.type === "data-checkpoint")
  ) {
    return;
  }

  const { id } = message;
  const ckpt = await vscodeHost.saveCheckpoint(`ckpt-msg-${id}`, {
    force: message.role === "user",
  });
  if (!ckpt) return;

  message.parts.push({
    type: "data-checkpoint",
    data: {
      commit: ckpt,
    },
  });
  return ckpt;
}

/**
 * Executes bash commands found in workflows within a message.
 * @param message The message to process for workflow bash commands.
 */
async function appendWorkflowBashOutputs(
  message: Message,
  abortSignal: AbortSignal,
) {
  if (message.role !== "user") return;

  const commands = extractWorkflowBashCommands(message);
  if (!commands.length) return [];

  const bashCommandResults: {
    command: string;
    output: string;
    error?: string;
  }[] = [];
  for (const command of commands) {
    if (abortSignal?.aborted) {
      break;
    }

    try {
      const { output, error } = await vscodeHost.executeBashCommand(
        command,
        ThreadAbortSignal.serialize(abortSignal),
      );
      bashCommandResults.push({ command, output, error });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      bashCommandResults.push({ command, output: "", error });
      // The AbortError is a specific error that should stop the whole process.
      if (e instanceof Error && e.name === "AbortError") {
        break;
      }
    }
  }
  if (bashCommandResults.length) {
    prompts.injectBashOutputs(message, bashCommandResults);
  }
}

async function updateTaskLineChanges(
  store: Store,
  taskId: string,
  firstCheckpoint: string,
) {
  const fileDiffResult = await vscodeHost.diffWithCheckpoint(firstCheckpoint);
  const totalAdditions =
    fileDiffResult?.reduce((sum, file) => sum + file.added, 0) ?? 0;
  const totalDeletions =
    fileDiffResult?.reduce((sum, file) => sum + file.removed, 0) ?? 0;

  const task = store.query(catalog.queries.makeTaskQuery(taskId));

  if (task) {
    const updatedAt = new Date();
    store.commit(
      catalog.events.updateLineChanges({
        id: taskId,
        lineChanges: {
          added: totalAdditions,
          removed: totalDeletions,
        },
        updatedAt,
      }),
    );
  }
}

async function updateChangedFiles(
  taskId: string,
  lastCheckpoint: string,
  lastMessage: Message,
) {
  // recent changed file since last checkpoint
  const recentChangedFiles = unique(
    lastMessage.parts
      .slice(
        lastMessage.parts.findIndex(
          (p) =>
            p.type === "data-checkpoint" && p.data.commit === lastCheckpoint,
        ) + 1,
      )
      .filter(
        (p) =>
          (p.type === "tool-applyDiff" ||
            p.type === "tool-multiApplyDiff" ||
            p.type === "tool-writeToFile") &&
          p.state === "output-available",
      )
      .map((p) => p.input.path),
  );

  const store = getTaskChangedFileStore(taskId);
  await store.getState().updateChangedFiles(recentChangedFiles, lastCheckpoint);
}
