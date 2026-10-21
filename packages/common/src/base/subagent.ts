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

/**
 * Tells the parent where an isolated subagent works. `removed` is undefined
 * while the subagent has not finished yet.
 */
export function formatSubagentWorktreeNote(
  worktree: { path: string; branch: string },
  removed?: boolean,
): string {
  if (removed === true) {
    return "The subagent made no changes, so its isolated worktree was removed.";
  }
  const location = `isolated worktree at ${worktree.path} (branch ${worktree.branch})`;
  if (removed === false) {
    return `The subagent's changes are in the ${location}; they were not applied to the current workspace.`;
  }
  return `The subagent works in an ${location}, created from the latest default branch. If it makes no changes, the worktree is removed when it finishes; otherwise its changes stay there and are not applied to the current workspace.`;
}

/** Tool result returned by newTask when the subagent starts in the background. */
export function createBackgroundSubAgentStartedResult(taskId: string): string {
  return `Subagent started in the background (backgroundJobId: ${getSubAgentBackgroundJobId(taskId)}). Its result will arrive in a system notification that resumes this task.
Next step: call attemptCompletion now and say the result is pending.
Exception: you may first do work that is unrelated to this subagent's assignment and does not need its result.
Never do any part of its assignment yourself, and do not poll, sleep, or guess its result.`;
}
