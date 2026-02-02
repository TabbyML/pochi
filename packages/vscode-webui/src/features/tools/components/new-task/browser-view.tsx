import { useBrowserSession } from "@/lib/use-browser-session";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from ".";
import { useWebsocketFrame } from "../../hooks/use-websocket-frame";
import { SubAgentView } from "./sub-agent-view";

export function BrowserView(props: NewTaskToolViewProps) {
  const { taskSource, uid, tool, toolCallStatusRegistryRef } = props;
  const { t } = useTranslation();
  const description = tool.input?.description;
  const browserSession = useBrowserSession(uid || "");
  const streamUrl = browserSession?.streamUrl;
  const frame = useWebsocketFrame(streamUrl);

  return (
    <SubAgentView
      icon={<Globe className="size-3.5" />}
      title={description}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
    >
      <div className="relative aspect-video max-h-[20vh] bg-black">
        {frame ? (
          <img
            src={`data:image/jpeg;base64,${frame}`}
            alt="Browser view"
            className="aspect-video h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            {t("browserView.noFrameAvailable")}
          </div>
        )}
      </div>
    </SubAgentView>
  );
}
