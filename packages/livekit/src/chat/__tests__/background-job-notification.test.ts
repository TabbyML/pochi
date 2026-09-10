import {
  type BackgroundJobTerminalEvent,
  createBackgroundJobNotification,
} from "@getpochi/common";
import { describe, expect, it } from "vitest";
import type { Message } from "../..";
import {
  attachBackgroundJobNotificationParts,
  createBackgroundJobNotificationMessage,
  getBackgroundJobNotificationIds,
  toBackgroundJobNotificationParts,
} from "../background-job-notification";

describe("createBackgroundJobNotificationMessage", () => {
  it("puts all notifications from one send point into one message", () => {
    const message = createBackgroundJobNotificationMessage(
      notificationParts("bgjob-cmd-1", "bgjob-cmd-2"),
    );

    expect(message.role).toBe("user");
    expect(getBackgroundJobNotificationIds(message.parts)).toHaveLength(2);
    expect(message.parts).toHaveLength(2);
  });

  it("rejects an empty batch", () => {
    expect(() => createBackgroundJobNotificationMessage([])).toThrow(
      "without parts",
    );
  });
});

describe("attachBackgroundJobNotificationParts", () => {
  it("rides along with the user message that is being sent", () => {
    const messages = attachBackgroundJobNotificationParts(
      [assistantMessage(), userMessage("fix it")],
      notificationParts("bgjob-cmd-1"),
    );

    expect(messages).toHaveLength(2);
    expect(messages?.at(-1)?.parts).toEqual([
      { type: "text", text: "fix it" },
      expect.objectContaining({ type: "data-background-job-notification" }),
    ]);
  });

  it("appends a message of its own after an assistant turn", () => {
    const messages = attachBackgroundJobNotificationParts(
      [userMessage("run it"), assistantMessage()],
      notificationParts("bgjob-cmd-1"),
    );

    expect(messages).toHaveLength(3);
    expect(messages?.at(-1)?.role).toBe("user");
    expect(getBackgroundJobNotificationIds(messages?.at(-1)?.parts ?? [])).toEqual(
      getBackgroundJobNotificationIds(notificationParts("bgjob-cmd-1")),
    );
  });

  it("skips notifications already delivered", () => {
    const parts = notificationParts("bgjob-cmd-1");
    const delivered = createBackgroundJobNotificationMessage(parts);

    expect(
      attachBackgroundJobNotificationParts(
        [userMessage("run it"), assistantMessage(), delivered],
        parts,
      ),
    ).toBeUndefined();
  });

  it("does nothing without pending notifications", () => {
    expect(
      attachBackgroundJobNotificationParts([userMessage("hi")], []),
    ).toBeUndefined();
  });
});

function notificationParts(...backgroundJobIds: string[]) {
  return toBackgroundJobNotificationParts(
    backgroundJobIds.map((backgroundJobId) =>
      createBackgroundJobNotification(event(backgroundJobId)),
    ),
  );
}

function event(backgroundJobId: string): BackgroundJobTerminalEvent {
  return {
    taskId: "task-1",
    backgroundJobId,
    outputFile: `/tmp/${backgroundJobId}.log`,
    status: "completed",
    command: `run ${backgroundJobId}`,
    exitCode: 0,
    finishedAt: 1,
  };
}

function userMessage(text: string): Message {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function assistantMessage(): Message {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [{ type: "text", text: "on it" }],
  };
}
