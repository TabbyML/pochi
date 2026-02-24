import { useFile } from "@/components/files-provider";
import { MessageMarkdown } from "@/components/message";
import { TaskThread } from "@/components/task-thread";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FixedStateChatContextProvider, useSendRetry } from "@/features/chat";
import { useNavigate } from "@/lib/hooks/use-navigate";
import { useReviewPlanTutorialCounter } from "@/lib/hooks/use-review-plan-tutorial-counter";
import { useDefaultStore } from "@/lib/use-default-store";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { FilePenLine, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuFileSymlink } from "react-icons/lu";
import type { NewTaskToolViewProps } from "./index";
import { SubAgentView } from "./sub-agent-view";

const reviewTutorialImage =
  "https://app.getpochi.com/images/review-plan-tutorial.gif";

export function PlannerView(props: NewTaskToolViewProps) {
  const { tool, isExecuting, taskSource, uid, toolCallStatusRegistryRef } =
    props;

  const { t } = useTranslation();
  const store = useDefaultStore();
  const file = useFile(taskSource?.parentId || "", "/plan.md");
  const sendRetry = useSendRetry();
  const navigate = useNavigate();
  const { count, incrementCount } = useReviewPlanTutorialCounter();
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = reviewTutorialImage;
    img.onload = () => {
      setIsImageLoaded(true);
    };
  }, []);

  const handleReviewPlan = () => {
    if (uid) {
      navigate({
        to: "/task",
        search: {
          uid,
          storeId: store.storeId,
        },
        replace: true,
        viewTransition: true,
      });
    }
  };

  const handleExecutePlan = () => {
    sendRetry();
  };

  return (
    <SubAgentView
      uid={uid}
      tool={tool}
      isExecuting={isExecuting}
      expandable={!!file}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
      headerActions={
        isVSCodeEnvironment() &&
        file && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              vscodeHost.openFile("pochi://-/plan.md");
            }}
          >
            <LuFileSymlink className="h-4 w-4 text-muted-foreground" />
          </Button>
        )
      }
      footerActions={
        isVSCodeEnvironment() && (
          <>
            <HoverCard
              openDelay={0}
              onOpenChange={(open) => {
                if (open && count <= 2 && isImageLoaded) {
                  incrementCount();
                }
              }}
            >
              <HoverCardTrigger asChild>
                <Button
                  variant="outline"
                  size="xs"
                  className="h-7 px-2"
                  onClick={handleReviewPlan}
                  disabled={isExecuting}
                >
                  <FilePenLine className="mr-0.5 size-3.5" />
                  {t("plannerView.reviewPlan")}
                </Button>
              </HoverCardTrigger>
              <HoverCardContent
                hidden={count > 2 || !isImageLoaded}
                className="w-[80vw] max-w-[480px]"
              >
                <div className="flex flex-col gap-2">
                  <img
                    src={reviewTutorialImage}
                    alt="Review Plan"
                    className="rounded-md"
                  />
                  <p className="mb-1 font-medium text-xl">
                    {t("plannerView.reviewPlanTitle")}
                  </p>
                  <span className="text-lg">
                    {t("plannerView.reviewPlanTooltip")}
                  </span>
                </div>
              </HoverCardContent>
            </HoverCard>
            <Button
              size="xs"
              className="h-7 px-2"
              onClick={handleExecutePlan}
              disabled={isExecuting || !file}
            >
              <Play className="mr-0.5 size-3.5" />
              {t("plannerView.executePlan")}
            </Button>
          </>
        )
      }
    >
      {file?.content ? (
        <ScrollArea viewportClassname="h-[300px]">
          <div className="p-3 text-xs">
            <MessageMarkdown>{file.content}</MessageMarkdown>
          </div>
        </ScrollArea>
      ) : taskSource && taskSource.messages.length > 1 ? (
        <FixedStateChatContextProvider
          toolCallStatusRegistry={toolCallStatusRegistryRef?.current}
        >
          <TaskThread
            source={taskSource}
            showMessageList={true}
            showTodos={false}
            scrollAreaClassName="border-none h-[300px] my-0"
            assistant={{ name: "Planner" }}
          />
        </FixedStateChatContextProvider>
      ) : (
        <div className="flex h-[300px] w-full items-center justify-center p-3 text-muted-foreground">
          <span className="text-base">
            {isExecuting
              ? t("plannerView.creatingPlan")
              : t("plannerView.planCreationPaused")}
          </span>
        </div>
      )}
    </SubAgentView>
  );
}
