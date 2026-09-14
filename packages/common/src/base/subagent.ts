import { getSubAgentBackgroundJobId } from "./background-job-id";
export {
  getSubAgentBackgroundJobId,
  getSubAgentTaskId,
} from "./background-job-id";
import type { BackgroundSubagentNotification } from "./message";

export type SubAgentResultNotification = BackgroundSubagentNotification;

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
