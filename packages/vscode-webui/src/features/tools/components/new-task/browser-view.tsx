import { cn } from "@/lib/utils";
import { getLogger } from "@getpochi/common";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const logger = getLogger("BrowserView");

interface BrowserViewProps {
  streamUrl: string;
}

export function BrowserView({ streamUrl }: BrowserViewProps) {
  const { t } = useTranslation();
  const [frame, setFrame] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "streaming">("idle");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let retryTimeout: NodeJS.Timeout;
    const retryInterval = 2500;

    const connect = () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      try {
        const ws = new WebSocket(streamUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setStatus("streaming");
        };

        ws.onclose = () => {
          setStatus("idle");
          // Always retry
          retryTimeout = setTimeout(connect, retryInterval);
        };

        ws.onerror = (event) => {
          logger.error("Browser stream error", event);
          // Force close to trigger onclose and retry
          ws.close();
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
        setStatus("idle");
        retryTimeout = setTimeout(connect, retryInterval);
      }
    };

    connect();

    return () => {
      clearTimeout(retryTimeout);
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [streamUrl]);

  return (
    <div className="mt-2 overflow-hidden rounded-sm border">
      {/* Status bar */}
      <div className="flex items-center gap-2 border-b bg-muted px-3 py-2">
        <StatusIndicator status={status} />
        <span className="truncate text-muted-foreground text-xs">
          {streamUrl}
        </span>
      </div>
      {/* Frame display */}
      <div className="relative aspect-video bg-black">
        {frame ? (
          <img
            src={`data:image/jpeg;base64,${frame}`}
            alt="Browser view"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            {status === "idle"
              ? t("browserView.connecting")
              : t("browserView.noFrameAvailable")}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: "idle" | "streaming" }) {
  const colors: Record<string, string> = {
    idle: "bg-yellow-400 animate-pulse",
    streaming: "bg-green-400",
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-2 w-2 rounded-full", colors[status])} />
      <span className="text-xs capitalize">{status}</span>
    </div>
  );
}
