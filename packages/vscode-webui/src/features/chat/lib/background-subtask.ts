import { constants } from "@getpochi/common";

export function shouldRunSubtaskInBackground(input?: {
  background?: boolean;
  agentType?: string;
}) {
  // These agents require the foreground browser session or todo result flow.
  return (
    !!input?.background &&
    input.agentType !== "browser" &&
    input.agentType !== constants.AttemptTodoCompletionAgentName
  );
}
