import { useFile } from "@/components/files-provider";
import { TaskThread } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import { browserSessionManager } from "@/lib/browser-session-manager";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from ".";
import { SubAgentView } from "./sub-agent-view";

export function BrowserView(props: NewTaskToolViewProps) {
  const { taskSource, uid, tool, toolCallStatusRegistryRef, isExecuting } =
    props;
  const { t } = useTranslation();
  const [frame, setFrame] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      return;
    }
    return browserSessionManager.subscribeFrame(uid, setFrame);
  }, [uid]);

  const file = useFile(
    taskSource?.parentId || "",
    `/browser-session/${tool.toolCallId}.mp4`,
  );
  const videoUrl = file?.content;

  return (
    <SubAgentView
      uid={uid}
      tool={tool}
      isExecuting={isExecuting}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
      expandable={!!videoUrl || !!frame}
    >
      {videoUrl ? (
        // biome-ignore lint/a11y/useMediaCaption: No audio track available
        <video
          src={videoUrl}
          controls
          playsInline
          className="aspect-video h-full w-full object-contain"
        />
      ) : frame ? (
        <img
          src={`data:image/jpeg;base64,${frame}`}
          alt="Browser view"
          className="aspect-video h-full w-full object-contain"
        />
      ) : taskSource && taskSource.messages.length > 1 ? (
        <FixedStateChatContextProvider
          toolCallStatusRegistry={toolCallStatusRegistryRef?.current}
        >
          <TaskThread
            source={taskSource}
            showMessageList={true}
            showTodos={false}
            scrollAreaClassName="aspect-video border-none w-full h-full max-h-full my-0"
            assistant={{ name: "Browser" }}
          />
        </FixedStateChatContextProvider>
      ) : (
        <div className="flex aspect-video h-full w-full items-center justify-center p-3 text-muted-foreground">
          <span className="text-base">
            {isExecuting ? t("browserView.executing") : t("browserView.paused")}
          </span>
        </div>
      )}
    </SubAgentView>
  );
}
