// @vitest-environment jsdom
import type { MonitorEventEnvelope } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useBackgroundJobNotificationDelivery } from "./use-background-job-notification-delivery";

const mocks = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  events: [] as MonitorEventEnvelope[],
}));
vi.mock("@/lib/hooks/use-background-job-notifications", () => ({
  useBackgroundJobNotifications: () => ({ notifications: [] }),
}));
vi.mock("./use-monitor-events", () => ({
  useMonitorEvents: () => ({
    events: mocks.events,
    acknowledge: mocks.acknowledge,
  }),
}));

it("acknowledges only monitor events that reached the conversation", () => {
  const delivered: MonitorEventEnvelope = {
    notificationId: "event-1",
    backgroundJobId: "bgjob-monitor-1",
    description: "Watch errors",
    command: "watch",
    outputFile: "/tmp/watch.log",
    lines: ["error"],
  };
  const pending = {
    ...delivered,
    notificationId: "event-2",
    lines: ["another error"],
  };
  mocks.events = [delivered, pending];
  const enqueue = vi.fn();
  const { rerender } = renderHook(
    ({ messages }: { messages: Message[] }) =>
      useBackgroundJobNotificationDelivery({
        taskId: "task-1",
        messages,
        enqueue,
      }),
    { initialProps: { messages: [] as Message[] } },
  );
  expect(enqueue).toHaveBeenCalledWith([delivered, pending]);
  expect(mocks.acknowledge).not.toHaveBeenCalled();
  rerender({
    messages: [
      {
        id: "user-1",
        role: "user",
        parts: [
          { type: "text", text: "Continue" },
          { type: "data-monitor-events", data: { batches: [delivered] } },
        ],
      },
    ],
  });
  expect(mocks.acknowledge).toHaveBeenCalledExactlyOnceWith("event-1");
});
