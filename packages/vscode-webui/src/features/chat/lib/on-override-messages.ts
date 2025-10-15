import { vscodeHost } from "@/lib/vscode";
import { prompts } from "@getpochi/common";
import { extractWorkflowBashCommands } from "@getpochi/common/message-utils";
import type { Message } from "@getpochi/livekit";
import { ThreadAbortSignal } from "@quilted/threads";

/**
 * Handles the onOverrideMessages event by appending a checkpoint to the last message.
 * This ensures that each request has a checkpoint for potential rollbacks.
 */
export async function onOverrideMessages({
  messages,
  abortSignal,
}: { messages: Message[]; abortSignal: AbortSignal }) {
  const lastMessage = messages.at(-1);
  if (lastMessage) {
    await appendCheckpoint(lastMessage);
    await appendWorkflowBashOutputs(lastMessage, abortSignal);
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
