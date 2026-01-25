import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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

    // Ensure we close existing connection before creating new one
    if (wsRef.current) {
      wsRef.current.close();
    }

    try {
      const ws = new WebSocket(streamUrl);
      wsRef.current = ws;
      ws.onopen = () => setStatus("streaming");
      ws.onclose = () => setStatus("closed");
      ws.onerror = () => setStatus("error");
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "frame") {
            setFrame(data.data); // base64 image
          }
        } catch (e) {
          console.error("Failed to parse browser frame", e);
        }
      };
    } catch (e) {
      console.error("Failed to connect to browser stream", e);
      setStatus("error");
    }

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
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
