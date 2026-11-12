import { getSubAgentBackgroundJobId } from "./background-job-id";
import { AttemptTodoCompletionAgentName } from "./constants";
export {
  getSubAgentBackgroundJobId,
  getSubAgentTaskId,
} from "./background-job-id";

/**
 * Agents that cannot be backgrounded: guide talks to the user
 * through askFollowupQuestion, and the todo audit resolves todos through the
 * foreground result flow.
 */
const ForegroundAgents = new Set<string>([
  "guide",
  AttemptTodoCompletionAgentName,
]);

export type SubAgentBackgroundInput = {
  background?: boolean;
  agentType?: string;
  spawn?: string;
};

/**
 * True when newTask starts an independent top-level task in its own tab
 * instead of a subagent of the calling task.
 */
export function isTopLevelTaskSpawn(input?: { spawn?: string }): boolean {
  return input?.spawn === "task";
}

/** Subagents run in the background unless the caller opts out with `background: false`. */
export function shouldRunSubAgentInBackground(
  input?: SubAgentBackgroundInput,
): boolean {
  return (
    !isTopLevelTaskSpawn(input) &&
    input?.background !== false &&
    !ForegroundAgents.has(input?.agentType ?? "")
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
 * Names a subagent task's isolated worktree: directory `subagent-<id>` on
 * branch `subagent/<id>`.
 */
export function getSubagentWorktreeId(taskId: string): string {
  const id = taskId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toLowerCase();
  if (!id) throw new Error(`Invalid task id for a worktree: ${taskId}`);
  return id;
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

/** Tool result returned by newTask when it spawns a top-level task. */
export function createTopLevelTaskStartedResult(
  taskId: string,
  worktree?: { path: string; branch?: string },
): string {
  const location = worktree
    ? `\nIt works in the worktree at ${worktree.path}${worktree.branch ? ` (branch ${worktree.branch})` : ""}, created from the HEAD commit of the current working directory; its changes are not applied to the current workspace.`
    : "";
  return `Started top-level task ${taskId} in its own tab. It runs independently and the user can follow and continue it there; its result is not returned to you.${location}
Its transcript is updated at the end of each of its turns at pochi://$/transcripts/${taskId}.md. Read it only when you need its progress or outcome.`;
}

/** Tool result returned by newTask when the subagent starts in the background. */
export function createBackgroundSubAgentStartedResult(taskId: string): string {
  return `Subagent started in the background (backgroundJobId: ${getSubAgentBackgroundJobId(taskId)}). Its result will arrive in a system notification that resumes this task.
Next step: call attemptCompletion now and say the result is pending.
Exception: you may first do work that is unrelated to this subagent's assignment and does not need its result.
Never do any part of its assignment yourself, and do not poll, sleep, or guess its result.`;
}
