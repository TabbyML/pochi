import { useBrowserSession } from "@/lib/use-browser-session";
import { useDefaultStore } from "@/lib/use-default-store";
import { catalog } from "@getpochi/livekit";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from ".";
import { useBrowserRecording } from "../../hooks/use-browser-recording";
import { useWebsocketFrame } from "../../hooks/use-websocket-frame";
import { SubAgentView } from "./sub-agent-view";

export function BrowserView(props: NewTaskToolViewProps) {
  const { taskSource, uid, tool, toolCallStatusRegistryRef, isExecuting } =
    props;
  const { t } = useTranslation();
  const description = tool.input?.description;
  const browserSession = useBrowserSession(uid || "");
  const streamUrl = browserSession?.streamUrl;
  const frame = useWebsocketFrame(streamUrl);
  useBrowserRecording(uid || "", frame, isExecuting);

  const store = useDefaultStore();
  const file = store.useQuery(
    catalog.queries.makeFileQuery(uid || "", `/browser-recording/${uid || ""}.webm`)
  )
  const videoUrl = file?.content

  return (
    <SubAgentView
      icon={<Globe className="size-3.5" />}
      title={description}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
    >
      <div className="flex flex-col gap-2 bg-black">
        <div className="relative aspect-video max-h-[20vh] w-full">
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              className="h-full w-full object-contain"
            >
              <track kind="captions" />
            </video>
          ) : frame ? (
            <img
              src={`data:image/jpeg;base64,${frame}`}
              alt="Browser view"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
              {t("browserView.noFrameAvailable")}
            </div>
          )}
        </div>
      </div>
    </SubAgentView>
  );
}
