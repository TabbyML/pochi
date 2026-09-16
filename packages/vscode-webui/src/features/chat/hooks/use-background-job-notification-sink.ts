import type {
  BackgroundJobNotificationPart,
  LiveChatKitBackgroundJobNotificationOptions,
} from "@getpochi/livekit";
import { useMemo, useState } from "react";

/** Mirrors the chat kit's pending notifications for the toolbar. */
export function useBackgroundJobNotificationSink() {
  const [pending, setPending] = useState<BackgroundJobNotificationPart[]>([]);
  const options = useMemo<LiveChatKitBackgroundJobNotificationOptions>(
    () => ({ onPendingChange: setPending }),
    [],
  );
  return { pending, options };
}
