import { getSubAgentBackgroundJobId } from "./background-job-id";
import { AttemptTodoCompletionAgentName } from "./constants";
export {
  getSubAgentBackgroundJobId,
  getSubAgentTaskId,
} from "./background-job-id";

/**
 * Agents that cannot be backgrounded: planner and guide talk to the user
 * through askFollowupQuestion, browser needs the foreground browser session,
 * and the todo audit resolves todos through the foreground result flow.
 */
const ForegroundAgents = new Set<string>([
  "planner",
  "guide",
  "browser",
  AttemptTodoCompletionAgentName,
]);

export type SubAgentBackgroundInput = {
  background?: boolean;
  agentType?: string;
};

/** Subagents run in the background unless the caller opts out with `background: false`. */
export function shouldRunSubAgentInBackground(
  input?: SubAgentBackgroundInput,
): boolean {
  return (
    input?.background !== false && !ForegroundAgents.has(input?.agentType ?? "")
  );
}

/** True only when the background was requested explicitly, not by default. */
export function isBackgroundSubAgentRequested(
  input?: SubAgentBackgroundInput,
): boolean {
  return input?.background === true && shouldRunSubAgentInBackground(input);
}

/** Stable notification identity for a task and its terminal status. */
export function getSubAgentNotificationId(task: {
  id: string;
  status: string;
}): string {
  return `${getSubAgentBackgroundJobId(task.id)}:terminal:${task.status}`;
}

/** Tool result returned by newTask when the subagent starts in the background. */
export function createBackgroundSubAgentStartedResult(taskId: string): string {
  return `Subagent started in the background (backgroundJobId: ${getSubAgentBackgroundJobId(taskId)}). Use killBackgroundJob with this ID to stop it. Its result will arrive later as a system notification; do not assume or fabricate its outcome before that notification arrives.`;
}
