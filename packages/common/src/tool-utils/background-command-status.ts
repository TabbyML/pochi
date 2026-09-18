import { parseBackgroundJobId } from "../base/background-job-id";
import { parseBackgroundJobOutputFilePath } from "../pochi-file-system/filepath-formatter";

/**
 * Appended to a managed background command transcript while its process is
 * still running. Completion stays notification-driven, so a finished status is
 * never reported here.
 */
export const BackgroundCommandRunningHint =
  "Background command is still running.";

/** Returns the `bgjob-cmd-*` id when the path is a managed command transcript. */
export function parseBackgroundCommandOutputFilePath(
  path: string,
): string | undefined {
  const outputFile = parseBackgroundJobOutputFilePath(path);
  if (outputFile?.kind !== "job") return undefined;
  return parseBackgroundJobId(outputFile.backgroundJobId) === "command"
    ? outputFile.backgroundJobId
    : undefined;
}

/** Marks read content as coming from a command that has not finished yet. */
export function appendBackgroundCommandRunningHint(content: string): string {
  if (!content) return BackgroundCommandRunningHint;
  const separator = content.endsWith("\n") ? "\n" : "\n\n";
  return `${content}${separator}${BackgroundCommandRunningHint}`;
}
