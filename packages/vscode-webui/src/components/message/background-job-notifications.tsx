import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { BackgroundJobPanel } from "@/features/tools";
import type { BackgroundJobNotification } from "@getpochi/common";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";

interface BackgroundJobNotificationsProps {
  notifications: BackgroundJobNotification[];
}

export function BackgroundJobNotifications({
  notifications,
}: BackgroundJobNotificationsProps) {
  const { t } = useTranslation();
  if (notifications.length === 0) return null;

  return (
    <CollapsibleSection
      title={
        <>
          <Bell className="size-4 shrink-0" />
          {t("backgroundJobNotifications.title")}
        </>
      }
      actions={
        <span className="text-muted-foreground text-xs">
          {t("backgroundJobNotifications.notificationCount", {
            count: notifications.length,
          })}
        </span>
      }
      contentClassName="gap-2 p-2"
    >
      {notifications.map((notification) => (
        <BackgroundJobPanel
          key={notification.notificationId}
          backgroundJobId={notification.backgroundJobId}
          appearance="notification"
          command={notification.command}
          status={notification.status}
          exitCode={notification.exitCode}
          outputFile={notification.outputFile}
        />
      ))}
    </CollapsibleSection>
  );
}
