import { buildTodoModeObjective } from "@/lib/message-utils";
import { vscodeHost } from "@/lib/vscode";
import type {
  LiveChatKitPendingInputOptions,
  PendingInput,
  QueuedUserInput,
} from "@getpochi/livekit";
import type React from "react";
import { useMemo, useState } from "react";
import type { DraftMessage } from "./use-chat-submit";

const EmptyPendingInput: PendingInput = { userInputs: [], notifications: [] };

/** What the toolbar stores with a queued user input to render or edit it. */
export type QueuedUserInputDisplay = Pick<DraftMessage, "raw" | "draft">;

/**
 * Mirrors the chat kit's pending input for the toolbar and persists queued
 * user inputs per task, so they survive webview reloads and task switches.
 */
export function usePendingInputSink(
  taskId: string,
  /** Read when inputs are taken, so it may be set after the kit is created. */
  onTakeUserInputsRef: React.RefObject<
    ((inputs: readonly QueuedUserInput[]) => void) | undefined
  >,
) {
  const [pending, setPending] = useState<PendingInput>(EmptyPendingInput);
  const options = useMemo<LiveChatKitPendingInputOptions>(
    () => ({
      onChange: setPending,
      onTakeUserInputs: (inputs) => onTakeUserInputsRef.current?.(inputs),
      storage: {
        load: async () =>
          (await vscodeHost.readQueuedUserInputs(taskId)) as QueuedUserInput[],
        save: (inputs) => vscodeHost.saveQueuedUserInputs(taskId, [...inputs]),
      },
    }),
    [taskId, onTakeUserInputsRef],
  );
  return { pending, options };
}

/** Recovers the draft message the toolbar queued as `input`. */
export function toDraftMessage(input: QueuedUserInput): DraftMessage {
  const display = input.display as QueuedUserInputDisplay | undefined;
  return {
    parts: input.parts,
    raw: display?.raw ?? {
      text: input.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n"),
    },
    draft: display?.draft,
  };
}

/**
 * Builds the todo objective for the first todo-mode input, from the raw prompt
 * and UI markers so generated system reminders stay out of the objective.
 */
export function getTodoModeObjective(
  inputs: readonly QueuedUserInput[],
): string | undefined {
  const message = inputs
    .map(toDraftMessage)
    .find((message) => message.raw.isTodoMode);
  if (!message) return undefined;

  const pastedTextFiles = message.parts.flatMap((part) =>
    part.type === "data-pasted-text" ? [part.data] : [],
  );
  return (
    buildTodoModeObjective(message.raw.text ?? "", pastedTextFiles) || undefined
  );
}
