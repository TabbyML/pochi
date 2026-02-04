import { useBrowserSession } from "@/lib/use-browser-session";
import { useDefaultStore } from "@/lib/use-default-store";
import { catalog } from "@getpochi/livekit";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from ".";
import { useBrowserFrame } from "../../hooks/use-browser-frame";
import { SubAgentView } from "./sub-agent-view";

export function BrowserView(props: NewTaskToolViewProps) {
  const { taskSource, uid, tool, toolCallStatusRegistryRef } = props;
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
      icon={<Globe className="size-3.5" />}
      title={description}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
    >
      <div className="flex flex-col gap-2 bg-black">
        <div className="relative aspect-video max-h-[20vh] w-full">
          {videoUrl ? (
            // biome-ignore lint/a11y/useMediaCaption: No audio track available
            <video
              key={videoUrl}
              src={videoUrl}
              controls
              playsInline
              className="h-full w-full object-contain"
            />
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
