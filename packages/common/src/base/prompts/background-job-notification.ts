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
</background-job-notification>`;
}
