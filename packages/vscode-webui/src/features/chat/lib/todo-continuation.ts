import { isAttemptTodoCompletionResolved } from "@/lib/todos-utils";
import type { Message } from "@getpochi/livekit";

export function shouldResumeTodoController({
  messages,
  status,
}: {
  messages: Message[];
  status: string;
}) {
  if (status !== "ready") return false;
  return getTodoContinuationDecision(messages) === true;
}

export function getTodoContinuationDecision(
  messages: Message[],
): boolean | undefined {
  const attemptTodoCompletion = getLastAttemptTodoCompletion(messages);
  if (attemptTodoCompletion) {
    const resolved = isAttemptTodoCompletionResolved(
      attemptTodoCompletion.part.output,
    );
    return resolved === false;
  }

  return undefined;
}

function getLastAttemptTodoCompletion(messages: Message[]) {
  const message = messages.at(-1);
  if (message?.role !== "assistant") return undefined;

  const part = message.parts.at(-1);
  if (
    part?.type === "tool-newTask" &&
    part.state === "output-available" &&
    part.input?.agentType === "attemptTodoCompletion"
  ) {
    return { message, part };
  }
}
