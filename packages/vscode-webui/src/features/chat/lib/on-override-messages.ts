import { vscodeHost } from "@/lib/vscode";
import { type LiveKitStore, type Message, catalog } from "@getpochi/livekit";
import { isInteractiveToolPart } from "@getpochi/tools";
import { isStaticToolUIPart } from "ai";
import { unique } from "remeda";
import { useRenderWidgetStore } from "../hooks/use-render-widget-store";

/**
 * Handles the onOverrideMessages event by appending a checkpoint to the last message.
 * This ensures that each request has a checkpoint for potential rollbacks.
 */
export async function onOverrideMessages({
  store,
  taskId,
  messages,
}: {
  store: LiveKitStore;
  taskId: string;
  messages: Message[];
  abortSignal: AbortSignal;
}) {
  writePendingRenderWidgetOutput(messages);

  const checkpoints = messages
    .flatMap((m) => m.parts.filter((p) => p.type === "data-checkpoint"))
    .map((p) => p.data.commit);
  const lastMessage = messages.at(-1);
  if (lastMessage) {
    const ckpt = await appendCheckpoint(lastMessage);

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

export function writePendingRenderWidgetOutput(messages: Message[]) {
  const outputMessage = findRenderWidgetOutputMessage(messages);
  if (!outputMessage) return;

  const store = useRenderWidgetStore.getState();
  const outputPartIndex = findPendingRenderWidgetPartIndex(outputMessage);
  if (outputPartIndex === undefined) return;

  const part = outputMessage.parts[outputPartIndex];
  if (!isStaticToolUIPart(part)) return;

  const state = store.getWidgetState(part.toolCallId) ?? {};
  const error = store.getWidgetError(part.toolCallId);
  const output = error ? { state, error } : { state };
  outputMessage.parts = outputMessage.parts.map((currentPart, index) =>
    index === outputPartIndex
      ? ({
          ...part,
          state: "output-available",
          output,
        } as Message["parts"][number])
      : currentPart,
  );
  store.clearWidgetState(part.toolCallId);
}

function findRenderWidgetOutputMessage(messages: Message[]) {
  const lastMessage = messages.at(-1);
  if (!lastMessage) return;
  if (lastMessage.role === "assistant") return lastMessage;
  if (lastMessage.role !== "user") return;

  const previousMessage = messages.at(-2);
  return previousMessage?.role === "assistant" ? previousMessage : undefined;
}

function findPendingRenderWidgetPartIndex(message: Message) {
  for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex--) {
    const part = message.parts[partIndex];
    if (!isStaticToolUIPart(part)) continue;
    if (!isInteractiveToolPart(part)) continue;
    if (part.state !== "input-available") continue;
    return partIndex;
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

async function updateTaskLineChanges(
  store: LiveKitStore,
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

  const taskChangedFiles = await vscodeHost.readTaskChangedFiles(taskId);
  await taskChangedFiles.updateChangedFiles(recentChangedFiles, lastCheckpoint);
}
