type BackgroundJobReadStatus = "idle" | "running" | "completed";

const BackgroundJobRapidReadThresholdMs = 1000;
const BackgroundJobRapidReadError =
  "Output has not changed since the last read. The previous read was less than 1 second ago; consider waiting about a second, for example by using executeCommand to run `sleep 1`, before reading again.";

export function assertBackgroundJobReadInterval({
  now = Date.now(),
  previousReadAt,
  status,
}: {
  now?: number;
  previousReadAt?: number;
  status: BackgroundJobReadStatus;
}) {
  if (
    status === "running" &&
    previousReadAt !== undefined &&
    now - previousReadAt < BackgroundJobRapidReadThresholdMs
  ) {
    throw new Error(BackgroundJobRapidReadError);
  }
}
