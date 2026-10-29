import { useStoreFile } from "@/components/files-provider";
import { TaskThread } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import { browserSessionManager } from "@/lib/browser-session-manager";
import {
  getToolPartError,
  isToolCallCancellationError,
} from "@/lib/tool-call-error";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from ".";
import { useBackgroundSubagentStatus } from "./background-status-icon";
import { MoveToBackgroundButton } from "./move-to-background-button";
import { SubAgentView } from "./sub-agent-view";

const BrowserRecordingVideoOffsetSeconds = 4.5;

export function BrowserView(props: NewTaskToolViewProps) {
  const {
    taskSource,
    uid,
    tool,
    toolCallStatusRegistryRef,
    isExecuting,
    onMoveToBackground,
  } = props;
  const { t } = useTranslation();
  const [frame, setFrame] = useState<string | null>(null);
  // A background task returns from newTask immediately and keeps running.
  const isBackground =
    tool.state === "output-available" && !!tool.output.backgroundJobId;
  const backgroundStatus = useBackgroundSubagentStatus(uid ?? "");
  const isRunning =
    isExecuting || (isBackground && backgroundStatus === "running");

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
  const showRecordingVideo = !!videoUrl && (!isRunning || hasToolSettled);
  const showBrowserFrame = !!frame;
  const showBrowserArtifact = showRecordingVideo || showBrowserFrame;
  const hasTaskThread = !!taskSource && taskSource.messages.length > 1;
  const hidePlaceholder =
    (!isExecuting && tool.state === "input-available") ||
    isToolCallCancellationError(getToolPartError(tool));

  return (
    <SubAgentView
      uid={uid}
      tool={tool}
      isExecuting={isRunning}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
      showToolCall={showBrowserArtifact}
      showTaskThread={showBrowserArtifact}
      isBackground={isBackground}
      statusOverride={
        isBackground && backgroundStatus
          ? {
              status: backgroundStatus,
              label: t(`backgroundTasks.${backgroundStatus}`),
            }
          : undefined
      }
      headerActions={
        onMoveToBackground && (
          <MoveToBackgroundButton onMoveToBackground={onMoveToBackground} />
        )
      }
    >
      {showBrowserArtifact ? (
        <div className="aspect-video w-full overflow-hidden">
          {showRecordingVideo ? (
            // biome-ignore lint/a11y/useMediaCaption: No audio track available
            <video
              src={`${videoUrl}#t=${BrowserRecordingVideoOffsetSeconds}`}
              controls
              playsInline
              className="h-full w-full object-contain"
            />
          ) : (
            <img
              src={`data:image/jpeg;base64,${frame}`}
              alt="Browser view"
              className="h-full w-full object-contain"
            />
          )}
        </div>
      ) : hasTaskThread ? (
        <FixedStateChatContextProvider
          toolCallStatusRegistry={toolCallStatusRegistryRef?.current}
        >
          <TaskThread
            source={taskSource}
            showMessageList={true}
            scrollAreaClassName="border-none"
            assistant={{ name: "Browser" }}
          />
        </FixedStateChatContextProvider>
      ) : !hidePlaceholder ? (
        <div className="flex aspect-video w-full items-center justify-center overflow-hidden p-3 text-muted-foreground">
          <span className="text-base">
            {isBackground && isRunning
              ? t("browserView.runningInBackground")
              : isRunning
                ? t("browserView.executing")
                : t("browserView.paused")}
          </span>
        </div>
      ) : null}
    </SubAgentView>
  );
}
