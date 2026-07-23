import { useStoreFile } from "@/components/files-provider";
import { TaskThread } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import { browserSessionManager } from "@/lib/browser-session-manager";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from ".";
import { SubAgentView } from "./sub-agent-view";

const BrowserRecordingVideoOffsetSeconds = 4.5;

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

  const file = useStoreFile(`/browser-session/${tool.toolCallId}.mp4`);
  const videoUrl = file?.content;
  const hasToolSettled =
    tool.state === "output-available" || tool.state === "output-error";
  const showRecordingVideo = !!videoUrl && (!isExecuting || hasToolSettled);
  const showBrowserFrame = !!frame;
  const showBrowserArtifact = showRecordingVideo || showBrowserFrame;

  return (
    <SubAgentView
      uid={uid}
      tool={tool}
      isExecuting={isExecuting}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
      showToolCall={showBrowserArtifact}
      showTaskThread={showBrowserArtifact}
    >
      <div className="aspect-video w-full overflow-hidden">
        {showRecordingVideo ? (
          // biome-ignore lint/a11y/useMediaCaption: No audio track available
          <video
            src={`${videoUrl}#t=${BrowserRecordingVideoOffsetSeconds}`}
            controls
            playsInline
            className="h-full w-full object-contain"
          />
        ) : showBrowserFrame ? (
          <img
            src={`data:image/jpeg;base64,${frame}`}
            alt="Browser view"
            className="h-full w-full object-contain"
          />
        ) : taskSource && taskSource.messages.length > 1 ? (
          <div className="h-full w-full">
            <FixedStateChatContextProvider
              toolCallStatusRegistry={toolCallStatusRegistryRef?.current}
            >
              <TaskThread
                source={taskSource}
                showMessageList={true}
                scrollAreaClassName="border-none h-full w-full my-0"
                assistant={{ name: "Browser" }}
              />
            </FixedStateChatContextProvider>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center p-3 text-muted-foreground">
            <span className="text-base">
              {isExecuting
                ? t("browserView.executing")
                : t("browserView.paused")}
            </span>
          </div>
        )}
      </div>
    </SubAgentView>
  );
}
