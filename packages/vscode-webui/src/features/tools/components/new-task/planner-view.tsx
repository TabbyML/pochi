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
import type { NewTaskToolViewProps } from "./index";
import { SubAgentView } from "./sub-agent-view";

export function PlannerView(props: NewTaskToolViewProps) {
  const { tool, isExecuting, taskSource, uid, toolCallStatusRegistryRef } =
    props;

  const { t } = useTranslation();
  const store = useDefaultStore();
  const file = store.useQuery(
    catalog.queries.makeFileQuery(taskSource?.parentId || "", "/plan.md"),
  );
  const sendRetry = useSendRetry();
  const navigate = useNavigate();
  const description = tool?.input?.description;

  const handleReviewPlan = () => {
    navigate({
      to: "/task",
      search: {
        uid: uid || "",
        storeId: store.storeId,
      },
    });
    vscodeHost.openFile("pochi://-/plan.md");
  };

  const handleExecutePlan = () => {
    sendRetry();
  };

  return (
    <SubAgentView
      icon={<ClipboardList className="size-3.5" />}
      title={description}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
      footerActions={
        <>
          <Button
            variant="outline"
            size="xs"
            className="h-7 px-2"
            onClick={handleReviewPlan}
            disabled={isExecuting}
          >
            <FilePenLine className="mr-0.5 size-3.5" />
            {t("planCard.reviewPlan")}
          </Button>
          <Button
            size="xs"
            className="h-7 px-2"
            onClick={handleExecutePlan}
            disabled={isExecuting}
          >
            <Play className="mr-0.5 size-3.5" />
            {t("planCard.executePlan")}
          </Button>
        </>
      }
    >
      <ScrollArea viewportClassname="max-h-[20vh]">
        <div className="p-3 text-xs">
          {file?.content ? (
            <MessageMarkdown>{file.content}</MessageMarkdown>
          ) : (
            <div className="flex h-[20vh] flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
              <span className="text-base">{t("planCard.creatingPlan")}</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </SubAgentView>
  );
}
