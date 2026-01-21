import { MessageMarkdown } from "@/components/message";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSendRetry } from "@/features/chat";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { catalog } from "@getpochi/livekit";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardList, FilePenLine, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

export function PlanCard({
  uid,
  parentId,
}: {
  uid: string;
  parentId: string;
}) {
  const { t } = useTranslation();
  const store = useDefaultStore();
  const file = store.query(catalog.queries.makeFileQuery(parentId, "/plan.md"));
  const sendRetry = useSendRetry();
  const navigate = useNavigate();

  const handleReviewPlan = () => {
    navigate({
      to: "/task",
      search: {
        uid,
        storeId: store.storeId,
      },
    });
    vscodeHost.openFile("pochi://self/plan.md");
  };

  const handleExecutePlan = () => {
    sendRetry();
  };

  return (
    <div className="mt-2 flex flex-col overflow-hidden rounded-md border shadow-sm">
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2 font-medium text-muted-foreground text-xs">
        <ClipboardList className="size-3.5" />
        <span>{t("planCard.title")}</span>
      </div>
      <ScrollArea className="h-[300px]">
        <div className="p-3 text-xs">
          <MessageMarkdown>{file?.content || ""}</MessageMarkdown>
        </div>
      </ScrollArea>
      <div className="flex items-center justify-end gap-2 border-t bg-muted/20 p-2">
        <Button
          variant="outline"
          size="xs"
          className="h-7 px-2"
          onClick={handleReviewPlan}
        >
          <FilePenLine className="mr-0.5 size-3.5" />
          {t("planCard.reviewPlan")}
        </Button>
        <Button size="xs" className="h-7 px-2" onClick={handleExecutePlan}>
          <Play className="mr-0.5 size-3.5" />
          {t("planCard.executePlan")}
        </Button>
      </div>
    </div>
  );
}
