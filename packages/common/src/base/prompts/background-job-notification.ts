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
  return `<background-job-notification>
  <background-job-id>${escapeXml(notification.backgroundJobId)}</background-job-id>
  <output-file>${escapeXml(notification.outputFile)}</output-file>
  <status>${notification.status}</status>
  <summary>${escapeXml(notification.summary)}</summary>
  <instruction>The background job has finished. Read the output file when its output is needed. If the file is empty, the command produced no captured output; do not wait or poll because the status above is final.</instruction>
</background-job-notification>`;
}
