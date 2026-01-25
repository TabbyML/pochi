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
  const [status, setStatus] = useState<
    "connecting" | "streaming" | "closed" | "error"
  >("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!streamUrl) return;

    let retryCount = 0;
    const maxRetries = 5;
    let retryTimeout: NodeJS.Timeout;
    let isUnmounted = false;

    const connect = () => {
      if (isUnmounted) return;

      logger.info(
        `Connecting to browser stream: ${streamUrl} (Attempt ${retryCount + 1})`,
      );

      // Ensure we close existing connection before creating new one
      if (wsRef.current) {
        // Remove listeners to prevent stale events
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }

      try {
        const ws = new WebSocket(streamUrl);
        wsRef.current = ws;
        ws.onopen = () => {
          if (isUnmounted) {
            ws.close();
            return;
          }
          logger.info("Browser stream connected");
          setStatus("streaming");
          retryCount = 0; // Reset retry count on success
        };
        ws.onclose = (event) => {
          if (isUnmounted) return;
          logger.info(`Browser stream closed: ${event.code} ${event.reason}`);
          setStatus("closed");

          // Retry if not normal closure (1000) and we haven't exceeded max retries
          if (event.code !== 1000 && retryCount < maxRetries) {
            const delay = Math.min(1000 * 1.5 ** retryCount, 10000);
            retryCount++;
            logger.info(`Retrying connection in ${delay}ms...`);
            retryTimeout = setTimeout(connect, delay);
          }
        };
        ws.onerror = (event) => {
          if (isUnmounted) return;
          logger.error("Browser stream error", event);
          setStatus("error");
        };
        ws.onmessage = (event) => {
          if (isUnmounted) return;
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
        setStatus("error");
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * 1.5 ** retryCount, 10000);
          retryCount++;
          retryTimeout = setTimeout(connect, delay);
        }
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      clearTimeout(retryTimeout);
      if (wsRef.current) {
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
            {status === "connecting"
              ? t("browserView.connecting")
              : status === "error"
                ? t("browserView.error")
                : t("browserView.noFrameAvailable")}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connecting: "bg-yellow-400 animate-pulse",
    streaming: "bg-green-400",
    closed: "bg-gray-400",
    error: "bg-red-400",
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-2 w-2 rounded-full", colors[status])} />
      <span className="text-xs capitalize">{status}</span>
    </div>
  );
}
