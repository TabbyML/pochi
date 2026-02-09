import { useFile } from "@/components/files-provider";
import { MessageMarkdown } from "@/components/message";
import { TaskThread } from "@/components/task-thread";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FixedStateChatContextProvider } from "@/features/chat";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from "./index";
import { SubAgentView } from "./sub-agent-view";

export function WalkthroughView(props: NewTaskToolViewProps) {
  const { tool, isExecuting, taskSource, uid, toolCallStatusRegistryRef } =
    props;

  const { t } = useTranslation();
  const file = useFile(taskSource?.parentId || "", "/walkthrough.md");

  return (
    <SubAgentView
      uid={uid}
      tool={tool}
      isExecuting={isExecuting}
      expandable={!!file}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
    >
      {file?.content ? (
        <ScrollArea viewportClassname="h-[200px]">
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
            scrollAreaClassName="border-none h-[200px] my-0"
            assistant={{ name: "Walkthrough" }}
          />
        </FixedStateChatContextProvider>
      ) : (
        <div className="flex h-[200px] flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground">
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
