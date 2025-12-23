import { Button } from "@/components/ui/button";
import { useSendMessage } from "@/features/chat";
import { vscodeHost } from "@/lib/vscode";
import {
  FileText,
  Play,
  SquareArrowOutUpRight,
} from "lucide-react";
import type React from "react";
import { useTranslation } from "react-i18next";

interface PlanCardProps {
  taskId: string;
}

export const PlanCard: React.FC<PlanCardProps> = ({ taskId }) => {
  const { t } = useTranslation();
  const sendMessage = useSendMessage();

  // Clean up taskId if it comes with the sanitization prefix
  const cleanTaskId = (taskId || "").replace(/^user-content-/, "");
  const planPath = cleanTaskId ? `.pochi/plans/${cleanTaskId}.md` : "";

  const openPlan = () => {
    if (planPath) vscodeHost.openFile(planPath);
  };

  const executePlan = () => {
    if (planPath) {
      sendMessage({
        prompt: t("chat.planCard.executePrompt", { path: planPath }),
      });
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded-md border bg-muted/30">
      <div className="flex items-center justify-between p-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
            <FileText className="size-3.5" />
          </div>
          <span className="truncate font-medium text-sm">
            {t("chat.planCard.title")}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t p-2">
        <Button
          size="sm"
          variant="outline"
          onClick={openPlan}
          disabled={!planPath}
          className="h-7 flex-1 gap-1.5 text-xs shadow-none"
        >
          <SquareArrowOutUpRight className="size-3.5 opacity-70" />
          {t("chat.planCard.reviewButton")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={executePlan}
          disabled={!planPath}
          className="h-7 flex-1 gap-1.5 text-xs shadow-none"
        >
          <Play className="size-3.5 opacity-70" />
          {t("chat.planCard.executeButton")}
        </Button>
      </div>
    </div>
  );
};

