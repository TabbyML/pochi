export type QueueCancelReason = "user-abort" | "previous-tool-call-failed";

export type ScheduledToolCallResult =
  | {
      kind: "success";
    }
  | {
      kind: "error";
      error: string;
    }
  | {
      kind: "cancelled";
      reason: "user-abort" | "user-reject" | "previous-tool-call-failed";
    };

export type ScheduledToolCall = {
  toolName: string;
  input: unknown;
  run: () => Promise<ScheduledToolCallResult>;
  cancel: (reason: QueueCancelReason) => void;
};

export function normalizeQueueCancelReason(
  reason?: unknown,
): QueueCancelReason {
  return reason === "previous-tool-call-failed"
    ? "previous-tool-call-failed"
    : "user-abort";
}
