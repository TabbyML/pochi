import { MessageMarkdown } from "@/components/message";
import { TaskThread } from "@/components/task-thread";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FixedStateChatContextProvider, useSendRetry } from "@/features/chat";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { catalog } from "@getpochi/livekit";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardList, FilePenLine, Play } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExpandIcon } from "../tool-container";
import type { NewTaskToolViewProps } from "./index";

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
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleReviewPlan = () => {
    navigate({
      to: "/task",
      search: {
        uid: uid || "",
        storeId: store.storeId,
      },
    });
    vscodeHost.openFile("pochi://self/plan.md");
  };

  const handleExecutePlan = () => {
    sendRetry();
  };

  return (
    <div>
      <div className="mt-2 flex flex-col overflow-hidden rounded-md border shadow-sm">
        <div className="flex items-center gap-2 border-b bg-muted px-3 py-2 font-medium text-muted-foreground text-xs">
          <ClipboardList className="size-3.5" />
          <span className="flex-1">{description}</span>
        </div>
        <ScrollArea viewportClassname="max-h-[300px]">
          <div className="p-3 text-xs">
            <MessageMarkdown>{file?.content || ""}</MessageMarkdown>
          </div>
        </ScrollArea>
        <div className="flex items-center justify-between gap-2 border-t bg-muted p-2">
          {taskSource && taskSource.messages.length > 1 && (
            <ExpandIcon
              className="mt-1 rotate-270 cursor-pointer text-muted-foreground"
              isExpanded={!isCollapsed}
              onClick={() => setIsCollapsed(!isCollapsed)}
            />
          )}
          <div className="flex items-center gap-2">
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
          </div>
        </div>
        {isCollapsed && taskSource && taskSource.messages.length > 1 && (
          <ScrollArea className="border-t" viewportClassname="max-h-[300px]">
            <div className="p-1">
              <FixedStateChatContextProvider
                toolCallStatusRegistry={toolCallStatusRegistryRef?.current}
              >
                <TaskThread
                  source={{ ...taskSource, isLoading: false }}
                  showMessageList={true}
                  showTodos={false}
                  scrollAreaClassName="border-none"
                  assistant={{ name: "Planner" }}
                />
              </FixedStateChatContextProvider>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
