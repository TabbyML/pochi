import { useBackgroundJobNotifications } from "@/lib/hooks/use-background-job-notifications";
import type { BackgroundJobNotification } from "@getpochi/common";
import {
  type BackgroundJobNotificationPart,
  type LiveChatKitBackgroundJobNotificationOptions,
  type Message,
  getBackgroundJobNotificationIds,
} from "@getpochi/livekit";
import { useEffect, useMemo, useState } from "react";

/**
 * Mirrors the notifications the chat kit has not delivered yet, so the toolbar
 * can render them. The kit owns the set; this only follows it.
 *
 * The returned options are stable, which matters because `useLiveChatKit`
 * captures them when the kit is constructed.
 */
export function useBackgroundJobNotificationSink() {
  const [pending, setPending] = useState<BackgroundJobNotificationPart[]>([]);
  const options = useMemo<LiveChatKitBackgroundJobNotificationOptions>(
    () => ({ onPendingChange: setPending }),
    [],
  );

  return { pending, options };
}

/**
 * Pushes finished background jobs into the chat kit, and acknowledges them once
 * they show up in the conversation. Delivery, not queueing, is the
 * acknowledgement signal: a request that never went out leaves the notification
 * pending instead of losing it.
 */
export function useBackgroundJobNotificationDelivery({
  taskId,
  messages,
  enqueue,
}: {
  taskId: string;
  messages: Message[];
  enqueue: (notifications: readonly BackgroundJobNotification[]) => void;
}) {
  const { notifications, acknowledge } = useBackgroundJobNotifications(taskId);

  useEffect(() => {
    if (notifications.length === 0) return;

    const deliveredIds = new Set(
      messages.flatMap((message) =>
        getBackgroundJobNotificationIds(message.parts),
      ),
    );
    for (const notification of notifications) {
      if (deliveredIds.has(notification.notificationId)) {
        void acknowledge?.(notification.notificationId);
      }
    }

    // The kit drops the ones it already has pending or delivered, so pushing
    // the same list again is free.
    enqueue(notifications);
  }, [acknowledge, enqueue, messages, notifications]);
}
