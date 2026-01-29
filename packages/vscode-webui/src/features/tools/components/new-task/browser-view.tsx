import { TaskThread } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import { useBrowserSessions } from "@/lib/use-browser-sessions";
import { getLogger } from "@getpochi/common";
import { Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from ".";
import { ExpandIcon } from "../tool-container";

const logger = getLogger("BrowserView");

export function BrowserView(props: NewTaskToolViewProps) {
  const { taskSource, uid, tool, toolCallStatusRegistryRef } = props;
  const { t } = useTranslation();
  const [frame, setFrame] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const description = tool.input?.description ?? "";
  const browserSessions = useBrowserSessions();

  const streamUrl =
    browserSessions[taskSource?.parentId || uid || ""]?.streamUrl;

  useEffect(() => {
    if (!streamUrl) return;

    let ws: WebSocket | null = null;
    let retryTimeout: NodeJS.Timeout;
    const retryInterval = 2500;

    const connect = () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }

      try {
        ws = new WebSocket(streamUrl);

        ws.onclose = () => {
          // Always retry
          retryTimeout = setTimeout(connect, retryInterval);
        };

        ws.onerror = (event) => {
          logger.error("Browser stream error", event);
          // Force close to trigger onclose and retry
          ws?.close();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "frame") {
              setFrame(data.data); // base64 image
            }
          } catch (e) {
            logger.error("Failed to parse browser frame", e);
          }
        };
      } catch (e) {
        logger.error("Failed to connect to browser stream", e);
        retryTimeout = setTimeout(connect, retryInterval);
      }
    };

    connect();

    return () => {
      clearTimeout(retryTimeout);
      if (ws) {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
        ws = null;
      }
    };
  }, [streamUrl]);

  return (
    <div className="mt-2 flex flex-col overflow-hidden rounded-sm border">
      <div className="flex items-center gap-2 border-b bg-muted px-3 py-2 font-medium text-muted-foreground text-xs">
        <Globe className="size-3.5" />
        <span className="flex-1 truncate">{description}</span>
      </div>
      <div className="relative aspect-video bg-black">
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
      {taskSource && taskSource.messages.length > 1 && (
        <div className="flex items-center gap-2 border-t bg-muted p-2">
          <ExpandIcon
            className="mt-1 rotate-270 cursor-pointer text-muted-foreground"
            isExpanded={!isCollapsed}
            onClick={() => setIsCollapsed(!isCollapsed)}
          />
        </div>
      )}
      {isCollapsed && taskSource && taskSource.messages.length > 1 && (
        <div className="p-1">
          <FixedStateChatContextProvider
            toolCallStatusRegistry={toolCallStatusRegistryRef?.current}
          >
            <TaskThread
              source={{ ...taskSource, isLoading: false }}
              showMessageList={true}
              showTodos={false}
              scrollAreaClassName="border-none"
              assistant={{ name: "Planner" }}
            />
          </FixedStateChatContextProvider>
        </div>
      )}
    </div>
  );
}
