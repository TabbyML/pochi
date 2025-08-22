import { vscodeHost } from "@/lib/vscode";
import type { Message } from "@getpochi/livekit";

/**
 * Handles the onOverrideMessages event by appending a checkpoint to the last message.
 * This ensures that each request has a checkpoint for potential rollbacks.
 */
export async function onOverrideMessages({
  messages,
}: { messages: Message[] }) {
  const lastMessage = messages.at(-1);
  if (lastMessage) {
    await appendCheckpoint(lastMessage);
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
}
