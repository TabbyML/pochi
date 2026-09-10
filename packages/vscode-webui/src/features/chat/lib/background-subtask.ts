import { constants } from "@getpochi/common";

export function shouldRunSubtaskInBackground(input?: {
  runInBackground?: boolean;
  agentType?: string;
}) {
  // These agents require the foreground browser session or todo result flow.
  return (
    !!input?.runInBackground &&
    input.agentType !== "browser" &&
    input.agentType !== constants.AttemptTodoCompletionAgentName
  );
}
