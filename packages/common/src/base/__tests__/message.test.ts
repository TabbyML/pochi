import { describe, expect, it } from "vitest";
import {
  MessageMetadata,
  BackgroundJobNotification,
  createBackgroundJobNotification,
  getPastedTextTitle,
} from "../message";

describe("getPastedTextTitle", () => {
  it("truncates by Unicode characters without splitting surrogate pairs", () => {
    expect(getPastedTextTitle("😀".repeat(81))).toBe(`${"😀".repeat(79)}…`);
  });
});

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
      kind: "command",
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

describe("BackgroundJobNotification", () => {
  const monitor = {
    kind: "monitor",
    notificationId: "monitor:1",
    backgroundJobId: "bgjob-monitor-1",
    description: "CI",
    command: "watch",
    outputFile: "/tmp/watch.log",
    lines: ["test passed"],
  };

  it("accepts incremental monitor batches without a terminal status", () => {
    expect(BackgroundJobNotification.parse(monitor)).toEqual(monitor);
  });

  it("validates monitor output and terminal state", () => {
    for (const patch of [
      { lines: "not an array" },
      { omittedLines: -1 },
      { ended: { reason: "done", status: "running" } },
    ]) {
      expect(BackgroundJobNotification.safeParse({ ...monitor, ...patch }).success).toBe(false);
    }
  });

  it("still requires terminal status for command and subagent results", () => {
    const command = createBackgroundJobNotification({
      taskId: "parent", backgroundJobId: "job", outputFile: "/tmp/job.log",
      command: "build", status: "completed", finishedAt: 1,
    });
    expect(BackgroundJobNotification.safeParse({ ...command, status: undefined }).success).toBe(false);
    expect(BackgroundJobNotification.safeParse({
      kind: "subagent", notificationId: "child:terminal", backgroundJobId: "child",
      taskId: "child", result: "done",
    }).success).toBe(false);
  });
});
