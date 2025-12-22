import { Button } from "@/components/ui/button";
import { useSendMessage } from "@/features/chat";
import { vscodeHost } from "@/lib/vscode";
import { Edit, FileText, MessageSquareReply } from "lucide-react";
import type React from "react";
import { useTranslation } from "react-i18next";

interface PlanCardProps {
  taskId: string;
}

export const PlanCard: React.FC<PlanCardProps> = ({ taskId }) => {
  const { t } = useTranslation();
  const sendMessage = useSendMessage();

  console.log("debug", { taskId });

  if (!taskId) {
    return null;
  }

  // Clean up taskId if it comes with the sanitization prefix
  const cleanTaskId = taskId.replace(/^user-content-/, "");
  const planPath = `.pochi/plans/${cleanTaskId}.md`;

  const openPlan = () => {
    vscodeHost.openFile(planPath);
  };

  const executePlan = () => {
    sendMessage({
      prompt: t("chat.planCard.executePrompt", { path: planPath }),
    });
  };

  return (
    <div className="group my-3 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
            <FileText className="size-5" />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-medium text-sm leading-none">
              {t("chat.planCard.title")}
            </h4>
            <p className="text-muted-foreground text-xs">
              {t("chat.planCard.status")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={openPlan}
            className="h-8 flex-1 gap-1.5 px-3 font-medium text-xs shadow-none"
          >
            <Edit className="size-3.5 opacity-70" />
            {t("chat.planCard.reviewButton")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={executePlan}
            className="h-8 flex-1 gap-1.5 px-3 font-medium text-xs shadow-none hover:bg-secondary/80"
          >
            <MessageSquareReply className="size-3.5 opacity-70" />
            {t("chat.planCard.executeButton")}
          </Button>
        </div>
      </div>
    </div>
  );
};
