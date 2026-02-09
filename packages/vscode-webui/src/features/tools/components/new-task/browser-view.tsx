import { TaskThread } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import { useBrowserSession } from "@/lib/use-browser-session";
import { useDefaultStore } from "@/lib/use-default-store";
import { catalog } from "@getpochi/livekit";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from ".";
import { useBrowserFrame } from "../../hooks/use-browser-frame";
import { SubAgentView } from "./sub-agent-view";

export function BrowserView(props: NewTaskToolViewProps) {
  const { taskSource, uid, tool, toolCallStatusRegistryRef, isExecuting } =
    props;
  const { t } = useTranslation();
  const completed = tool.state === "output-available";
  const browserSession = useBrowserSession(uid || "");
  const streamUrl = browserSession?.streamUrl;
  const frame = useBrowserFrame({
    toolCallId: tool.toolCallId,
    parentTaskId: taskSource?.parentId || "",
    completed,
    streamUrl,
  });
  const store = useDefaultStore();
  const file = store.useQuery(
    catalog.queries.makeFileQuery(
      taskSource?.parentId || "",
      `/browser-session/${tool.toolCallId}.mp4`,
    ),
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
        <div className="relative aspect-video h-[20vh]">
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
            scrollAreaClassName="border-none h-[20vh] my-0"
            assistant={{ name: "Browser" }}
          />
        </FixedStateChatContextProvider>
      ) : (
        <div className="flex h-[20vh] w-full items-center justify-center p-3 text-muted-foreground">
          <span className="text-base">
            {isExecuting ? t("browserView.executing") : t("browserView.paused")}
          </span>
        </div>
      )}
    </SubAgentView>
  );
}
