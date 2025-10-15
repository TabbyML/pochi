import { vscodeHost } from "@/lib/vscode";
import { prompts } from "@getpochi/common";
import {
  executeWorkflowBashCommands,
  isWorkflowTextPart,
} from "@getpochi/common/message-utils";
import type { Message } from "@getpochi/livekit";
import { ThreadAbortSignal } from "@quilted/threads";
import type { TextUIPart } from "ai";

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

  const bashCommandResults = await executeWorkflowBashCommands(
    message,
    (command: string, signal?: AbortSignal) =>
      vscodeHost.executeBashCommand(
        command,
        ThreadAbortSignal.serialize(signal as AbortSignal),
      ),
    abortSignal,
  );

  if (bashCommandResults.length) {
    const bashCommandOutputs = bashCommandResults.map(
      ({ command, output, error }) => {
        let result = `$ ${command}`;
        if (output) {
          result += `\n${output}`;
        }
        if (error) {
          result += `\nERROR: ${error}`;
        }
        return result;
      },
    );
    const reminderPart = {
      type: "text",
      text: prompts.createSystemReminder(
        `Bash command outputs:\n${bashCommandOutputs.join("\n\n")}`,
      ),
    } satisfies TextUIPart;
    const workflowPartIndex = message.parts.findIndex(isWorkflowTextPart);
    const indexToInsert = workflowPartIndex === -1 ? 0 : workflowPartIndex;
    message.parts = [
      ...message.parts.slice(0, indexToInsert),
      reminderPart,
      ...message.parts.slice(indexToInsert),
    ];
  }
}
