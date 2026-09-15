import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { BackgroundJobPanel } from "@/features/tools";
import type {
  BackgroundJobNotification,
  MonitorEventEnvelope,
} from "@getpochi/common";
import { Activity, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";

interface BackgroundJobNotificationsProps {
  notifications: (BackgroundJobNotification | MonitorEventEnvelope)[];
}

export function BackgroundJobNotificationItems({
  notifications,
}: BackgroundJobNotificationsProps) {
  const items: (BackgroundJobNotification | MonitorEventEnvelope[])[] = [];
  const monitors = new Map<string, MonitorEventEnvelope[]>();
  for (const notification of notifications) {
    if (!("lines" in notification)) {
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
