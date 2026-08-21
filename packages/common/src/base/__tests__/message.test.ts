import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  MessageMetadata,
  createBackgroundJobNotification,
  updateMessage,
} from "../message";

describe("updateMessage", () => {
  it("replaces a message without mutating existing snapshots", () => {
    const message: UIMessage = {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    };
    const messages = [message];
    const snapshot = [...messages];

    const updated = updateMessage(messages, 0, (current) => ({
      parts: [...current.parts, { type: "text", text: "world" }],
    }));

    expect(messages[0]).toBe(updated);
    expect(messages[0]).not.toBe(message);
    expect(snapshot[0]).toBe(message);
    expect(snapshot[0].parts).toEqual([{ type: "text", text: "hello" }]);

    if (false) {
      updateMessage(messages, 0, (current) => {
        // @ts-expect-error update callbacks receive deeply readonly messages.
        current.parts.push({ type: "text", text: "mutated" });
        const textPart = current.parts[0];
        if (textPart?.type === "text") {
          // @ts-expect-error nested part fields are readonly too.
          textPart.text = "mutated";
        }
        return undefined;
      });
    }
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
