import type { BackgroundJobNotification } from "../message";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderBackgroundJobNotification(
  notification: BackgroundJobNotification,
): string {
  const detail =
    notification.kind === "subagent"
      ? `  <task-id>${escapeXml(notification.taskId)}</task-id>
${notification.agentType ? `  <agent-type>${escapeXml(notification.agentType)}</agent-type>\n` : ""}${notification.title ? `  <title>${escapeXml(notification.title)}</title>\n` : ""}  <result>${escapeXml(notification.result)}</result>`
      : `  <output-file>${escapeXml(notification.outputFile)}</output-file>
  <summary>${escapeXml(notification.summary)}</summary>`;
  const instruction =
    notification.kind === "subagent"
      ? "Review the subagent result and take appropriate action. The status above is final."
      : "Read the output file when its output is needed. If the file is empty, the command produced no captured output; do not wait or poll because the status above is final.";
  return `<background-job-notification>
  <notification-id>${escapeXml(notification.notificationId)}</notification-id>
  <background-job-id>${escapeXml(notification.backgroundJobId)}</background-job-id>
  <kind>${notification.kind ?? "command"}</kind>
  <status>${notification.status}</status>
${detail}
  <instruction>This is an automated notification, not user input. ${instruction}</instruction>
</background-job-notification>`;
}
