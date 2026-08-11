import type { BackgroundJobTerminalEvent } from "@getpochi/common";
import { describe, expect, it } from "vitest";
import { createBackgroundJobNotificationMessage } from "../background-job-notification";

describe("createBackgroundJobNotificationMessage", () => {
  it("puts all events from one send point into one message", () => {
    const message = createBackgroundJobNotificationMessage([
      event("bgjob-cmd-1", "completed"),
      event("bgjob-cmd-2", "failed"),
    ]);

    expect(message.role).toBe("user");
    expect(message.parts).toHaveLength(2);
    expect(message.parts).toEqual([
      expect.objectContaining({
        type: "data-background-job-notification",
        data: expect.objectContaining({ backgroundJobId: "bgjob-cmd-1" }),
      }),
      expect.objectContaining({
        type: "data-background-job-notification",
        data: expect.objectContaining({ backgroundJobId: "bgjob-cmd-2" }),
      }),
    ]);
  });

  it("rejects an empty batch", () => {
    expect(() => createBackgroundJobNotificationMessage([])).toThrow(
      "without events",
    );
  });
});

function event(
  backgroundJobId: string,
  status: BackgroundJobTerminalEvent["status"],
): BackgroundJobTerminalEvent {
  return {
    taskId: "task-1",
    backgroundJobId,
    outputFile: `/tmp/${backgroundJobId}.log`,
    status,
    command: `run ${backgroundJobId}`,
    ...(status === "failed" ? { exitCode: 7 } : { exitCode: 0 }),
    finishedAt: 1,
  };
}
