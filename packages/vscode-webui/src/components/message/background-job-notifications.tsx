import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { BackgroundJobPanel } from "@/features/tools";
import type { BackgroundJobNotification } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { Bell } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SubagentResultNotificationItem } from "./subagent-results";

interface BackgroundJobNotificationsProps {
  notifications: BackgroundJobNotification[];
}

export function BackgroundJobNotificationItems({
  notifications,
}: BackgroundJobNotificationsProps) {
  return notifications.map((notification) =>
    notification.kind === "subagent" ? (
      <SubagentResultNotificationItem
        key={notification.notificationId}
        result={notification}
      />
    ) : (
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
    ),
  );
}

/** Collect all known notification types in their original message-part order. */
export function MessageNotifications({ parts }: { parts: Message["parts"] }) {
  const items = parts.flatMap((part, partIndex): ReactNode[] => {
    if (part.type === "data-background-job-notification") {
      return [
        <BackgroundJobNotificationItems
          key={`command:${partIndex}`}
          notifications={[part.data]}
        />,
      ];
    }
    return [];
  });
  return <NotificationGroup count={items.length}>{items}</NotificationGroup>;
}

function NotificationGroup({
  count,
  children,
}: { count: number; children: ReactNode }) {
  const { t } = useTranslation();
  if (count === 0) return null;

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
          {count}
        </Badge>
      }
      contentClassName="gap-0.5 border-t p-2"
    >
      {children}
    </CollapsibleSection>
  );
}
