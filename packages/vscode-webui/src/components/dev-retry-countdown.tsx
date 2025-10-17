import type { PendingApproval } from "@/features/approval";
import { useIsDevMode } from "@/features/settings";
import { Bug } from "lucide-react";
import { useTranslation } from "react-i18next";

interface DevRetryCountdownProps {
  pendingApproval: PendingApproval | null | undefined;
  status: string;
}

export function DevRetryCountdown({
  pendingApproval,
  status,
}: DevRetryCountdownProps) {
  const { t } = useTranslation();
  const [isDevMode] = useIsDevMode();
  if (!isDevMode) return null;
  return (
    <span className="absolute top-1 right-2 text-foreground/80 text-xs">
      <span className="flex items-center gap-1">
        <Bug className="inline size-3" />
        <span>{status}</span>
        {pendingApproval?.name === "retry" ? (
          <div>
            <span>
              {t("devRetryCountdown.attempts")} {pendingApproval.attempts}
            </span>{" "}
            /{" "}
            <span>
              {t("devRetryCountdown.countdown")} {pendingApproval.countdown}
            </span>{" "}
            /{" "}
            <span>
              {t("devRetryCountdown.delay")} {pendingApproval.delay}
            </span>
          </div>
        ) : undefined}
      </span>
    </span>
  );
}
