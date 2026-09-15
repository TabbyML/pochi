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
  return notifications.map((notification) => {
    if ("lines" in notification) {
      const text = [
        ...notification.lines,
        ...(notification.ended ? [notification.ended.reason] : []),
      ].join("\n");
      return (
        <BackgroundJobPanel
          key={notification.notificationId}
          backgroundJobId={notification.backgroundJobId}
          appearance="notification"
          command={notification.command}
          notificationIcon={<Activity className="size-3" />}
          notificationTitle={text || notification.description}
          summary={[notification.description, text].filter(Boolean).join("\n")}
          status={notification.ended?.status}
          exitCode={notification.ended?.exitCode}
          outputFile={notification.outputFile}
        />
      );
    }
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
