/**
 * Host-agnostic protocol for background subagent (newTask with
 * runInBackground) result delivery. When a background subagent task
 * completes, its result is injected into the parent conversation as a
 * `data-subagent-results` part, rendered for the LLM with
 * formatSubAgentNotifications. Shared by the CLI task runner and the
 * VSCode webview so both hosts speak the same protocol.
 */

import { prompts } from "./prompts";

/** One completed (or failed) background subagent, ready for injection. */
export interface SubAgentResultNotification {
  taskId: string;
  agentType?: string;
  /** The subtask title (the newTask description). */
  title?: string;
  status: "completed" | "failed";
  result: string;
}

/** Tool result returned by newTask when the subagent starts in the background. */
export function createBackgroundSubAgentStartedResult(taskId: string): string {
  return `Subagent started in the background (backgroundTaskId: ${taskId}). Its result will arrive later as a system notification; do not assume or fabricate its outcome before that notification arrives.`;
}

function renderSubAgentResult(
  notification: SubAgentResultNotification,
): string {
  const title = notification.title ? ` "${notification.title}"` : "";
  const agent = notification.agentType
    ? ` (agentType: ${notification.agentType})`
    : "";
  const header =
    notification.status === "completed"
      ? `Subagent ${notification.taskId}${title}${agent} completed with result:`
      : `Subagent ${notification.taskId}${title}${agent} failed:`;
  return `${header}\n${notification.result}`;
}

/**
 * Renders one delivery of background subagent results as the system-reminder
 * user message injected into the parent conversation. System reminders are
 * kept on the LLM path but hidden from the chat UI.
 */
export function formatSubAgentNotifications(
  results: SubAgentResultNotification[],
): string {
  const body = results.map(renderSubAgentResult).join("\n\n");
  return prompts.createSystemReminder(
    `The following background subagents started with the newTask tool have finished. This is an automated notification, not user input. Review the results and take appropriate action:\n${body}`,
  );
}
