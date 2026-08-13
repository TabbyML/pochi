import type { BackgroundJobNotification } from "@getpochi/common";
import { describe, expect, it } from "vitest";
import type { DraftMessage } from "../hooks/use-chat-submit";
import {
  enqueueBackgroundJobNotifications,
  getBackgroundJobNotificationIds,
} from "./background-job-notification-queue";

describe("enqueueBackgroundJobNotifications", () => {
  it("queues multiple notifications as parts of one message", () => {
    const messages = enqueueBackgroundJobNotifications([], [
      notification("bgjob-cmd-1"),
      notification("bgjob-cmd-2"),
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].parts).toHaveLength(2);
    expect(getBackgroundJobNotificationIds(messages[0])).toEqual([
      "bgjob-cmd-1:terminal",
      "bgjob-cmd-2:terminal",
    ]);
    expect(messages[0].raw.nonRemovable).toBe(true);
  });

  it("merges later notifications into the pending notification message", () => {
    const first = enqueueBackgroundJobNotifications([], [
      notification("bgjob-cmd-1"),
    ]);
    const messages = enqueueBackgroundJobNotifications(first, [
      notification("bgjob-cmd-2"),
    ]);

    expect(messages).toHaveLength(1);
    expect(getBackgroundJobNotificationIds(messages[0])).toEqual([
      "bgjob-cmd-1:terminal",
      "bgjob-cmd-2:terminal",
    ]);
  });

  it("deduplicates notifications already queued or repeated in the batch", () => {
    const first = enqueueBackgroundJobNotifications([], [
      notification("bgjob-cmd-1"),
    ]);
    const messages = enqueueBackgroundJobNotifications(first, [
      notification("bgjob-cmd-1"),
      notification("bgjob-cmd-2"),
      notification("bgjob-cmd-2"),
    ]);

    expect(getBackgroundJobNotificationIds(messages[0])).toEqual([
      "bgjob-cmd-1:terminal",
      "bgjob-cmd-2:terminal",
    ]);
  });

  it("does not merge notifications into a regular queued message", () => {
    const regular: DraftMessage = {
      parts: [{ type: "text", text: "hello" }],
      raw: { text: "hello" },
    };
    const messages = enqueueBackgroundJobNotifications([regular], [
      notification("bgjob-cmd-1"),
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe(regular);
    expect(getBackgroundJobNotificationIds(messages[1])).toEqual([
      "bgjob-cmd-1:terminal",
    ]);
  });
});

function notification(backgroundJobId: string): BackgroundJobNotification {
  return {
    notificationId: `${backgroundJobId}:terminal`,
    backgroundJobId,
    outputFile: `/tmp/${backgroundJobId}.log`,
    command: `run ${backgroundJobId}`,
    status: "completed",
    summary: `Background command "${backgroundJobId}" completed`,
    exitCode: 0,
    finishedAt: 1,
  };
}
