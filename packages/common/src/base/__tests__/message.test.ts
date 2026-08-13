import { describe, expect, it } from "vitest";
import {
  MessageMetadata,
  createBackgroundJobNotification,
} from "../message";

describe("MessageMetadata", () => {
  it("preserves assistant input and cache-read token usage", () => {
    const metadata = MessageMetadata.parse({
      kind: "assistant",
      totalTokens: 12,
      inputTokens: 0,
      cacheReadTokens: 0,
      finishReason: "stop",
    });

    expect(metadata).toMatchObject({
      inputTokens: 0,
      cacheReadTokens: 0,
    });
  });
});

describe("createBackgroundJobNotification", () => {
  it.each([
    ["completed", 0, 'Background command "build" completed with exit code 0'],
    ["failed", 7, 'Background command "build" failed with exit code 7'],
    ["stopped", undefined, 'Background command "build" was stopped'],
  ] as const)("formats a %s terminal event", (status, exitCode, summary) => {
    expect(
      createBackgroundJobNotification({
        taskId: "task-1",
        backgroundJobId: "bgjob-cmd-1",
        outputFile: "/tmp/bgjob-cmd-1.log",
        status,
        command: "build",
        ...(exitCode !== undefined ? { exitCode } : {}),
        finishedAt: 123,
      }),
    ).toEqual({
      notificationId: "bgjob-cmd-1:terminal",
      backgroundJobId: "bgjob-cmd-1",
      outputFile: "/tmp/bgjob-cmd-1.log",
      command: "build",
      status,
      summary,
      ...(exitCode !== undefined ? { exitCode } : {}),
      finishedAt: 123,
    });
  });
});
