import { vscodeHost } from "@/lib/vscode";
import { prompts } from "@getpochi/common";
import { extractWorkflowBashCommands } from "@getpochi/common/message-utils";
import type {
  FileDiff,
  TaskChangedFile,
} from "@getpochi/common/vscode-webui-bridge";
import { type Message, catalog } from "@getpochi/livekit";
import type { Store } from "@livestore/livestore";
import { ThreadAbortSignal } from "@quilted/threads";
import { getTaskChangedFileStoreHook } from "./use-task-changed-files";

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
  const lastMessage = messages.at(-1);
  if (lastMessage) {
    const ckpt = await appendCheckpoint(lastMessage);
    await appendWorkflowBashOutputs(lastMessage, abortSignal);
    if (!ckpt) return;
    await updateTaskChanges(store, taskId, messages);
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

async function updateTaskChanges(
  store: Store,
  taskId: string,
  messages: Message[],
) {
  const checkpoints = messages
    .flatMap((m) => m.parts.filter((p) => p.type === "data-checkpoint"))
    .map((p) => p.data.commit);

  if (checkpoints.length < 1) {
    return;
  }

  const firstCheckpoint = checkpoints[0];
  const fileDiffResult = await vscodeHost.diffWithCheckpoint(firstCheckpoint);
  updateTaskLineChanges(store, taskId, fileDiffResult);
  await updateChangedFileStore(taskId, fileDiffResult, firstCheckpoint);
}

async function updateTaskLineChanges(
  store: Store,
  taskId: string,
  fileDiffResult: FileDiff[] | null,
) {
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

async function updateChangedFileStore(
  taskId: string,
  fileDiffResult: FileDiff[] | null,
  firstCheckpoint: string,
) {
  const store = getTaskChangedFileStoreHook(taskId);
  const { changedFiles, setChangedFile } = store.getState();

  const updatedChangedFiles: TaskChangedFile[] = [];
  for (const fileDiff of fileDiffResult || []) {
    const currentFile = changedFiles.find(
      (f) => f.filepath === fileDiff.filepath,
    );

    // first time seeing this file change
    if (!currentFile) {
      updatedChangedFiles.push({
        filepath: fileDiff.filepath,
        added: fileDiff.added,
        removed: fileDiff.removed,
        content: fileDiff.created
          ? null
          : { type: "checkpoint", commit: firstCheckpoint },
        deleted: fileDiff.deleted,
        state: "pending",
      });
    }
  }
  const diffResult = await vscodeHost.diffChangedFiles(changedFiles);
  updatedChangedFiles.push(...diffResult);
  setChangedFile(updatedChangedFiles);
}
