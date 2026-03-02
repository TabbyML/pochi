import { useStoreFile } from "@/components/files-provider";
import { MessageMarkdown } from "@/components/message";
import { TaskThread } from "@/components/task-thread";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FixedStateChatContextProvider } from "@/features/chat";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { useTranslation } from "react-i18next";
import { LuFileSymlink } from "react-icons/lu";
import type { NewTaskToolViewProps } from "./index";
import { SubAgentView } from "./sub-agent-view";

export function WalkthroughView(props: NewTaskToolViewProps) {
  const { tool, isExecuting, taskSource, uid, toolCallStatusRegistryRef } =
    props;

  const { t } = useTranslation();
  const file = useStoreFile("/walkthrough.md");

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
              vscodeHost.openFile("pochi://-/walkthrough.md");
            }}
          >
            <LuFileSymlink className="h-4 w-4 text-muted-foreground" />
          </Button>
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
            assistant={{ name: "Walkthrough" }}
          />
        </FixedStateChatContextProvider>
      ) : (
        <div className="flex h-[300px] flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground">
          <span className="text-base">
            {isExecuting
              ? t("walkthroughView.creatingWalkthrough")
              : t("walkthroughView.walkthroughCreationPaused")}
          </span>
        </div>
      )}
    </SubAgentView>
  );
}
