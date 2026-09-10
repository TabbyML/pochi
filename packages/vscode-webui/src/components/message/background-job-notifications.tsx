import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { BackgroundJobPanel } from "@/features/tools";
import type { BackgroundJobNotification } from "@getpochi/common";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";

interface BackgroundJobNotificationsProps {
  notifications: BackgroundJobNotification[];
}

export function BackgroundJobNotificationItems({
  notifications,
}: BackgroundJobNotificationsProps) {
  return notifications.map((notification) => (
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
  ));
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
