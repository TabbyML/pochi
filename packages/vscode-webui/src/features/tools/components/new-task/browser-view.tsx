import { TaskThread } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import { useBrowserSession } from "@/lib/use-browser-session";
import { useDefaultStore } from "@/lib/use-default-store";
import { catalog } from "@getpochi/livekit";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from ".";
import { useBrowserFrame } from "../../hooks/use-browser-frame";
import { StatusIcon } from "../status-icon";
import { SubAgentView } from "./sub-agent-view";

export function BrowserView(props: NewTaskToolViewProps) {
  const { taskSource, uid, tool, toolCallStatusRegistryRef, isExecuting } =
    props;
  const { t } = useTranslation();
  const description = tool.input?.description;
  const completed =
    tool.state === "output-available" &&
    "result" in tool.output &&
    tool.output.result.trim().length > 0;
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
      icon={
        <StatusIcon
          tool={tool}
          isExecuting={isExecuting}
          className="align-baseline"
          iconClassName="size-3.5"
          successIcon={<Globe className="size-3.5" />}
        />
      }
      title={description}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
      expandable={!!videoUrl || !!frame}
    >
      {videoUrl ? (
        <div className="relative aspect-video max-h-[20vh] bg-black">
          {/* biome-ignore lint/a11y/useMediaCaption: No audio track available */}
          <video
            key={videoUrl}
            src={videoUrl}
            controls
            playsInline
            className="h-full w-full object-contain"
          />
        </div>
      ) : frame ? (
        <div className="relative aspect-video max-h-[20vh] bg-black">
          <img
            src={`data:image/jpeg;base64,${frame}`}
            alt="Browser view"
            className="aspect-video h-full w-full object-contain"
          />
        </div>
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
        <div className="relative flex h-[20vh] flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground">
          <span className="text-base">
            {isExecuting ? t("browserView.executing") : t("browserView.paused")}
          </span>
        </div>
      )}
    </SubAgentView>
  );
}
