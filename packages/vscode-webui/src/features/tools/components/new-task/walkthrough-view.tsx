import { MessageMarkdown } from "@/components/message";
import { TaskThread } from "@/components/task-thread";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FixedStateChatContextProvider } from "@/features/chat";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { catalog } from "@getpochi/livekit";
import { ClipboardList, SquareArrowOutUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatusIcon } from "../status-icon";
import type { NewTaskToolViewProps } from "./index";
import { SubAgentView } from "./sub-agent-view";

export function WalkthroughView(props: NewTaskToolViewProps) {
  const { tool, isExecuting, taskSource, toolCallStatusRegistryRef } = props;

  const { t } = useTranslation();
  const store = useDefaultStore();
  const file = store.useQuery(
    catalog.queries.makeFileQuery(
      taskSource?.parentId || "",
      "/walkthrough.md",
    ),
  );
  const description = tool?.input?.description;

  const handleOpenWalkthrough = () => {
    vscodeHost.openFile("pochi://-/walkthrough.md");
  };

  return (
    <SubAgentView
      icon={
        <StatusIcon
          tool={tool}
          isExecuting={isExecuting}
          className="align-baseline"
          iconClassName="size-3.5"
          successIcon={<ClipboardList className="size-3.5" />}
        />
      }
      title={description}
      expandable={!!file}
      actions={
        <Button
          size="icon"
          variant="ghost"
          disabled={isExecuting}
          onClick={handleOpenWalkthrough}
          className="size-auto px-2 py-1"
        >
          <SquareArrowOutUpRight className="size-3.5" />
        </Button>
      }
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
    >
      {file?.content ? (
        <ScrollArea viewportClassname="h-[20vh]">
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
            scrollAreaClassName="border-none h-[20vh] my-0"
            assistant={{ name: "Walkthrough" }}
          />
        </FixedStateChatContextProvider>
      ) : (
        <div className="flex h-[20vh] flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground">
          <span className="text-base">
            {isExecuting
              ? t("walkthroughCard.creatingWalkthrough")
              : t("walkthroughCard.walkthroughCreationPaused")}
          </span>
        </div>
      )}
    </SubAgentView>
  );
}
