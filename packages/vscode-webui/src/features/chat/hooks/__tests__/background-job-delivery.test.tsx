import { Chat, useChat } from "@ai-sdk/react";
import type { MonitorEventEnvelope } from "@getpochi/common";
import {
  type BackgroundJobNotificationPart,
  type BlobStore,
  LiveChatKit,
  type Message,
  getBackgroundJobNotificationIds,
} from "@getpochi/livekit";
import { makeJobStore } from "@getpochi/livekit/testing";
import type { ChatInit, UIMessageChunk } from "ai";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

it.each([0, 6100])(
  "delivers queued monitor endings after a %ims response without another wakeup",
  async (responseDuration) => {
    const streams: ReadableStreamDefaultController<UIMessageChunk>[] = [];
    const openStreams = new Set<
      ReadableStreamDefaultController<UIMessageChunk>
    >();
    const requests: Message[][] = [];
    class StreamChat extends Chat<Message> {
      constructor(init: ChatInit<Message>) {
        super({
          ...init,
          transport: {
            sendMessages: async ({ messages }) => {
              requests.push(structuredClone(messages));
              return new ReadableStream<UIMessageChunk>({
                start(controller) {
                  streams.push(controller);
                  openStreams.add(controller);
                  controller.enqueue({
                    type: "start",
                    messageId: `reply-${streams.length}`,
                    messageMetadata: { kind: "assistant", totalTokens: 10 },
                  });
                  controller.enqueue({ type: "text-start", id: "text" });
                  controller.enqueue({
                    type: "text-delta",
                    id: "text",
                    delta: "received",
                  });
                },
              });
            },
            reconnectToStream: async () => null,
          },
        });
      }
    }
    const finish = (
      stream: ReadableStreamDefaultController<UIMessageChunk>,
    ) => {
      stream.enqueue({ type: "text-end", id: "text" });
      stream.enqueue({ type: "finish", finishReason: "stop" });
      stream.close();
      openStreams.delete(stream);
    };
    const { store } = makeJobStore();
    let onPendingChange: (parts: BackgroundJobNotificationPart[]) => void =
      () => {};
    const kit = new LiveChatKit({
      taskId: "task-1",
      store,
      blobStore: {} as BlobStore,
      chatClass: StreamChat,
      getters: { getLLM: () => ({ id: "test" }) as never },
      backgroundJobNotifications: {
        onPendingChange: (parts) => onPendingChange(parts),
      },
    });
    function Host() {
      const [pending, setPending] = useState<BackgroundJobNotificationPart[]>(
        [],
      );
      onPendingChange = setPending;
      const { messages, status } = useChat({
        chat: kit.chat,
        experimental_throttle: 100,
      });
      // biome-ignore lint/correctness/useExhaustiveDependencies: match the toolbar's wakeups for new messages and queued notifications.
      useEffect(() => {
        if (status === "ready") kit.flushBackgroundJobNotifications();
      }, [messages, status, pending]);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    const unsubscribe = kit.subscribeBackgroundJobs();
    try {
      // Let SDK status updates and React effects run in their real order.
      // Wrapping stream completion in act can hide the sendMessage promise race.
      flushSync(() => root.render(<Host />));
      await kit.backgroundJobManager.watchTask("task-1");
      const event: MonitorEventEnvelope = {
        notificationId: "first",
        backgroundJobId: "bgjob-monitor-1",
        description: "CI",
        command: "watch",
        outputFile: "/tmp/watch.log",
        lines: ["passed"],
      };
      kit.enqueueBackgroundJobNotifications([event]);
      await expect.poll(() => kit.chat.status).toBe("streaming");
      kit.enqueueBackgroundJobNotifications([
        {
          ...event,
          notificationId: "ended",
          ended: {
            status: "completed",
            exitCode: 0,
            reason: "exited with code 0",
          },
        },
      ]);
      // A stale idle caller must not start a concurrent request.
      expect(kit.flushBackgroundJobNotifications()).toBe(false);
      expect(requests).toHaveLength(1);
      if (responseDuration)
        await new Promise((resolve) => setTimeout(resolve, responseDuration));
      finish(streams[0]);
      await expect.poll(() => requests.length, { timeout: 1000 }).toBe(2);
      expect(kit.pendingBackgroundJobNotifications).toEqual([]);
      expect(
        getBackgroundJobNotificationIds(
          requests[1].flatMap((message) => message.parts),
        ),
      ).toEqual(["first", "ended"]);
      finish(streams[1]);
      await expect.poll(() => kit.chat.status).toBe("ready");
      const send = vi.spyOn(kit.chat, "sendMessage");
      kit.enqueueBackgroundJobNotifications([event]);
      expect(kit.flushBackgroundJobNotifications()).toBe(false);
      expect(send).not.toHaveBeenCalled();
    } finally {
      root.unmount();
      unsubscribe();
      for (const stream of openStreams) finish(stream);
      await kit.backgroundJobManager.dispose();
    }
  },
  15000,
);
