import { vscodeHost } from "@/lib/vscode";
import { updateMessage } from "@getpochi/common";
import { type LiveKitStore, type Message, catalog } from "@getpochi/livekit";
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
  writeRenderWidgetOutput(messages);

  const checkpoints = messages
    .flatMap((m) => m.parts.filter((p) => p.type === "data-checkpoint"))
    .map((p) => p.data.commit);
  const lastMessage = messages.at(-1);
  if (lastMessage) {
    const lastMessageIndex = messages.length - 1;
    const ckpt = await appendCheckpoint(messages, lastMessageIndex);

    const firstCheckpoint = checkpoints.at(0);
    if (firstCheckpoint) {
      // side bar diff edits
      await updateTaskLineChanges(store, taskId, firstCheckpoint);
    }

    const lastCheckpoint = checkpoints.at(-1);
    const updatedLastMessage = messages[lastMessageIndex];
    if (ckpt && updatedLastMessage.role === "assistant" && lastCheckpoint) {
      // diff summary in chat view
      await updateChangedFiles(taskId, lastCheckpoint, updatedLastMessage);
    }
  }
}

export function writeRenderWidgetOutput(messages: Message[]) {
  const store = useRenderWidgetStore.getState();
  if (messages.at(-1)?.role !== "user") return;
  const messageIndex = messages.length - 2;
  if (messages[messageIndex]?.role !== "assistant") return;

  updateMessage(messages, messageIndex, (message) => {
    let changed = false;
    const parts = message.parts.map((part) => {
      if (part.type !== "tool-renderWidget") return part;
      if (
        part.state !== "input-available" &&
        part.state !== "output-available"
      ) {
        return part;
      }

      changed = true;
      const state =
        store.getWidgetState(part.toolCallId) ??
        getExistingRenderWidgetState(part.output) ??
        {};
      const output = { state };
      const error = store.getWidgetError(part.toolCallId);
      if (error !== undefined) {
        // @ts-expect-error renderWidget output schema intentionally omits runtime errors.
        output.error = error.message;
      }
      store.clearWidgetState(part.toolCallId);
      return {
        ...part,
        state: "output-available" as const,
        output,
      };
    });

    return changed ? { parts } : undefined;
  });
}

function getExistingRenderWidgetState(output: unknown) {
  if (typeof output !== "object" || output === null) return undefined;
  if (!Object.hasOwn(output, "state")) return undefined;
  return (output as { state?: unknown }).state;
}

/**
 * Appends a checkpoint to a message if one doesn't already exist in the current step.
 * A checkpoint is created to save the current state before making changes.
 */
async function appendCheckpoint(messages: Message[], messageIndex: number) {
  const message = messages[messageIndex];
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

  updateMessage(messages, messageIndex, (current) => ({
    parts: [
      ...current.parts,
      {
        type: "data-checkpoint",
        data: {
          commit: ckpt,
        },
      },
    ],
  }));
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
