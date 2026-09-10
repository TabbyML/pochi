import type { TFunction } from "i18next";

/**
 * How a finished background job is worded, wherever it is shown: next to a
 * notification's title, and on the hover of a row in the manage panel. The
 * exit code is the part a status colour cannot carry.
 */
export function getBackgroundJobStatusLabel(
  status: "completed" | "failed" | "stopped",
  exitCode: number | undefined,
  t: TFunction,
): string {
  return status === "completed"
    ? t("backgroundJobNotifications.completed", { exitCode: exitCode ?? 0 })
    : status === "failed"
      ? exitCode === undefined
        ? t("backgroundJobNotifications.failedNoExit")
        : t("backgroundJobNotifications.failed", { exitCode })
      : t("backgroundJobNotifications.stopped");
}
