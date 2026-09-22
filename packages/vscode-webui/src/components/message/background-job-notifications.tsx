import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { BackgroundJobPanel } from "@/features/tools";
import type {
  BackgroundJobNotification,
  BackgroundMonitorNotification,
} from "@getpochi/common";
import {
  type Message,
  getBackgroundJobNotificationParts,
} from "@getpochi/livekit";
import { Activity, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SubagentResultNotificationItem } from "./subagent-results";

interface BackgroundJobNotificationsProps {
  notifications: BackgroundJobNotification[];
}

export function BackgroundJobNotificationItems({
  notifications,
}: BackgroundJobNotificationsProps) {
  const items: (
    | Exclude<BackgroundJobNotification, BackgroundMonitorNotification>
    | BackgroundMonitorNotification[]
  )[] = [];
  const monitors = new Map<string, BackgroundMonitorNotification[]>();
  for (const notification of notifications) {
    if (notification.kind !== "monitor") {
      items.push(notification);
      continue;
    }
    let group = monitors.get(notification.backgroundJobId);
    if (!group) {
      group = [];
      monitors.set(notification.backgroundJobId, group);
      items.push(group);
    }
    group.push(notification);
  }

  return items.map((item) => {
    if (Array.isArray(item)) {
      const notification = item[0];
      const ended = item.findLast((batch) => batch.ended)?.ended;
      return (
        <BackgroundJobPanel
          key={notification.backgroundJobId}
          backgroundJobId={notification.backgroundJobId}
          appearance="notification"
          command={notification.command}
          notificationIcon={<Activity className="size-3" />}
          notificationTitle={
            notification.description?.trim() ||
            notification.command?.trim() ||
            notification.backgroundJobId
          }
          notificationEvents={item.map((batch) => ({
            id: batch.notificationId,
            text: [
              ...(batch.omittedLines
                ? [
                    `[${batch.omittedLines} monitor events omitted; read the output file for full output]`,
                  ]
                : []),
              ...batch.lines,
              ...(batch.ended ? [batch.ended.reason] : []),
            ].join("\n"),
          }))}
          status={ended?.status}
          exitCode={ended?.exitCode}
          outputFile={notification.outputFile}
        />
      );
    }
    const notification = item;
    if (notification.kind === "subagent")
      return (
        <SubagentResultNotificationItem
          key={notification.notificationId}
          result={notification}
        />
      );
    return (
      <BackgroundJobPanel
        key={notification.notificationId}
        backgroundJobId={notification.backgroundJobId}
        appearance="notification"
        command={notification.command}
        summary={notification.summary}
        status={notification.status}
        exitCode={notification.exitCode}
        outputFile={notification.outputFile}
      />
    );
  });
}

export function BackgroundJobNotifications({
  notifications,
}: BackgroundJobNotificationsProps) {
  const { t } = useTranslation();
  if (notifications.length === 0) return null;

  return (
    <CollapsibleSection
      defaultOpen
      className="overflow-hidden"
      title={
        <>
          <Bell className="size-4 shrink-0 text-muted-foreground" />
          {t("backgroundJobNotifications.title")}
        </>
      }
      actions={
        <Badge
          variant="secondary"
          className="h-5 min-w-5 rounded-full px-1.5 text-muted-foreground"
        >
          {notifications.length}
        </Badge>
      }
      contentClassName="gap-0.5 border-t p-2"
    >
      <BackgroundJobNotificationItems notifications={notifications} />
    </CollapsibleSection>
  );
}

/** Keep monitor batches grouped across all notification parts in this message. */
export function MessageNotifications({ parts }: { parts: Message["parts"] }) {
  const notifications = getBackgroundJobNotificationParts(parts).map(
    (part) => part.data,
  );
  return <BackgroundJobNotifications notifications={notifications} />;
}
