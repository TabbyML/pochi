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
  let detail: string;
  let instruction: string;
  let status: string;
  switch (notification.kind) {
    case "monitor": {
      status = notification.ended
        ? (notification.ended.status ?? "ended")
        : "running";
      const lines = [
        ...(notification.omittedLines
          ? [
              `[${notification.omittedLines} monitor events omitted; read the output file for full output]`,
            ]
          : []),
        ...notification.lines,
      ];
      detail = `  <description>${escapeXml(notification.description)}</description>
  <command>${escapeXml(notification.command)}</command>
  <output-file>${escapeXml(notification.outputFile)}</output-file>
  <events>${escapeXml(lines.join("\n"))}</events>${notification.ended ? `\n  <end-reason>${escapeXml(notification.ended.reason)}</end-reason>` : ""}${notification.ended?.exitCode !== undefined ? `\n  <exit-code>${notification.ended.exitCode}</exit-code>` : ""}`;
      instruction = notification.ended
        ? "Review the final monitor events and take appropriate action. The monitor has ended; read the output file if more detail is needed."
        : "Review these incremental monitor events and take appropriate action. This batch is not a final result; the monitor may produce more events.";
      break;
    }
    case "subagent":
      status = notification.status;
      detail = `  <task-id>${escapeXml(notification.taskId)}</task-id>
${notification.agentType ? `  <agent-type>${escapeXml(notification.agentType)}</agent-type>\n` : ""}${notification.title ? `  <title>${escapeXml(notification.title)}</title>\n` : ""}  <result>${escapeXml(notification.result)}</result>`;
      instruction =
        "Review the subagent result and take appropriate action. The status above is final.";
      break;
    case "command":
      status = notification.status;
      detail = `  <output-file>${escapeXml(notification.outputFile)}</output-file>
  <summary>${escapeXml(notification.summary)}</summary>`;
      instruction =
        "Read the output file when its output is needed. If the file is empty, the command produced no captured output; do not wait or poll because the status above is final.";
      break;
  }
  return `<background-job-notification>
  <notification-id>${escapeXml(notification.notificationId)}</notification-id>
  <background-job-id>${escapeXml(notification.backgroundJobId)}</background-job-id>
  <kind>${notification.kind}</kind>
  <status>${status}</status>
${detail}
  <instruction>This is an automated notification, not user input. ${instruction}</instruction>
</background-job-notification>`;
}
