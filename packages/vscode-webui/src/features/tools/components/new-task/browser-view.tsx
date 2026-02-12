import { useFile } from "@/components/files-provider";
import { TaskThread } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import { browserRecordingManager } from "@/lib/browser-recording-manager";
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
    return browserRecordingManager.subscribeFrame(tool.toolCallId, setFrame);
  }, [tool.toolCallId]);

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
        <div className="relative aspect-video h-[200px]">
          {/* biome-ignore lint/a11y/useMediaCaption: No audio track available */}
          <video
            src={videoUrl}
            controls
            playsInline
            className="h-full w-full object-contain"
          />
        </div>
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
            scrollAreaClassName="border-none h-[200px] my-0"
            assistant={{ name: "Browser" }}
          />
        </FixedStateChatContextProvider>
      ) : (
        <div className="flex h-[200px] w-full items-center justify-center p-3 text-muted-foreground">
          <span className="text-base">
            {isExecuting ? t("browserView.executing") : t("browserView.paused")}
          </span>
        </div>
      )}
    </SubAgentView>
  );
}
