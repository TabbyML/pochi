import type { BackgroundJobTerminalEvent } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { describe, expect, it } from "vitest";
import {
  deliverBackgroundJobNotifications,
  takeBackgroundJobNotificationMessage,
} from "../background-job-notification-delivery";

describe("takeBackgroundJobNotificationMessage", () => {
  it("drains every pending event into one message", () => {
    const pending = [event("bgjob-cmd-1"), event("bgjob-cmd-2")];

    const message = takeBackgroundJobNotificationMessage(pending);

    expect(pending).toHaveLength(0);
    expect(message?.parts).toHaveLength(2);
  });

  it("returns nothing when no job finished", () => {
    expect(takeBackgroundJobNotificationMessage([])).toBeUndefined();
  });
});

describe("deliverBackgroundJobNotifications", () => {
  it("delivers at a step boundary that continues the loop", () => {
    const pending = [event("bgjob-cmd-1")];
    const chat = fakeChat();

    const delivered = deliverBackgroundJobNotifications("next", pending, chat);

    expect(delivered).toBe(true);
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0].role).toBe("user");
    expect(chat.messages[0].parts).toEqual([
      expect.objectContaining({
        type: "data-background-job-notification",
        data: expect.objectContaining({ backgroundJobId: "bgjob-cmd-1" }),
      }),
    ]);
    // Drained, so the drain at the end of the task does not repeat it.
    expect(pending).toHaveLength(0);
  });

  it("delivers nothing when no job finished during the step", () => {
    const chat = fakeChat();

    expect(deliverBackgroundJobNotifications("next", [], chat)).toBe(false);
    expect(chat.messages).toHaveLength(0);
  });

  it("keeps notifications pending while the step is retried", () => {
    const pending = [event("bgjob-cmd-1")];
    const chat = fakeChat();

    const delivered = deliverBackgroundJobNotifications("retry", pending, chat);

    expect(delivered).toBe(false);
    expect(chat.messages).toHaveLength(0);
    expect(pending).toHaveLength(1);
  });

  it("leaves the finished step to drain notifications itself", () => {
    const pending = [event("bgjob-cmd-1")];
    const chat = fakeChat();

    const delivered = deliverBackgroundJobNotifications(
      "finished",
      pending,
      chat,
    );

    expect(delivered).toBe(false);
    expect(chat.messages).toHaveLength(0);
    expect(pending).toHaveLength(1);
  });
});

function fakeChat() {
  const messages: Message[] = [];
  return {
    messages,
    appendOrReplaceMessage(message: Message) {
      messages.push(message);
    },
  };
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
